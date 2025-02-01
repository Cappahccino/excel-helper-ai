import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { API_CONFIG } from "@/config/apiConfig";
import { FileData, LambdaRequestBody, LambdaResponse } from "@/types/messages";

async function getFileData(fileId: string): Promise<FileData> {
  const { data, error } = await supabase
    .from('excel_files')
    .select('*')
    .eq('id', fileId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch file data: ${error.message}`);
  }

  return data;
}

async function storeMessage(
  content: string,
  fileId: string,
  userId: string,
  isAiResponse: boolean,
  aiResponseData?: LambdaResponse
) {
  const messageData = {
    content,
    excel_file_id: fileId,
    user_id: userId,
    is_ai_response: isAiResponse,
    ...(aiResponseData && {
      openai_model: aiResponseData.openAiResponse?.model,
      openai_usage: aiResponseData.openAiResponse?.usage,
      raw_response: aiResponseData.openAiResponse
    })
  };

  const { error } = await supabase
    .from('chat_messages')
    .insert(messageData);

  if (error) {
    console.error(`Error storing ${isAiResponse ? 'AI' : 'user'} message:`, error);
    throw error;
  }
}

async function analyzeLambdaFunction(requestBody: LambdaRequestBody): Promise<LambdaResponse> {
  console.log('Sending request to Lambda:', requestBody);
  
  const response = await fetch(API_CONFIG.LAMBDA_FUNCTION_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_CONFIG.LAMBDA_AUTH_TOKEN}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lambda response error:', response.status, errorText);
    throw new Error(`Lambda function error: ${errorText || 'Unknown error'}`);
  }

  const data = await response.json();
  console.log('Lambda response:', data);
  return data;
}

export function useChat(fileId: string | null, userId: string | null) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const handleMessageSubmit = async (message: string) => {
    if (!fileId || !userId || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      console.log('Starting analysis with:', { fileId, userId, message });

      const fileData = await getFileData(fileId);

      // Store user message first
      await storeMessage(message, fileId, userId, false);

      // Analyze with Lambda function
      const requestBody: LambdaRequestBody = {
        fileId,
        filePath: fileData.file_path,
        query: message,
        supabaseUrl: API_CONFIG.SUPABASE_URL!,
        supabaseKey: API_CONFIG.SUPABASE_KEY!
      };

      const analysis = await analyzeLambdaFunction(requestBody);
      console.log('Analysis completed:', analysis);

      // Store AI response
      await storeMessage(analysis.message, fileId, userId, true, analysis);
      
      toast({
        title: "Analysis Complete",
        description: "Your Excel file has been analyzed successfully.",
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze Excel file",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    isAnalyzing,
    handleMessageSubmit
  };
}