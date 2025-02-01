import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/types/chat";

export function useChat(fileId: string | null, userId: string | null) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const handleMessageSubmit = async (message: string) => {
    if (!fileId || !userId || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      console.log('Starting analysis with:', {
        fileId,
        userId,
        message
      });

      // Get the file data first
      const { data: fileData, error: fileError } = await supabase
        .from('excel_files')
        .select('*')
        .eq('id', fileId)
        .single();

      if (fileError) {
        throw new Error(`Failed to fetch file data: ${fileError.message}`);
      }

      // Call Lambda function through Supabase Edge Function
      const { data: analysis, error: analysisError } = await supabase.functions
        .invoke('analyze-excel', {
          body: { 
            fileId: fileId,
            filePath: fileData.file_path,
            query: message,
            supabaseUrl: process.env.SUPABASE_URL,
            supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
          }
        });

      if (analysisError) {
        console.error('Analysis error:', analysisError);
        throw analysisError;
      }

      console.log('Analysis completed:', analysis);

      // Store the chat message
      const { error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          content: message,
          excel_file_id: fileId,
          user_id: userId,
          is_ai_response: false
        });

      if (messageError) {
        console.error('Error storing user message:', messageError);
        throw messageError;
      }

      // Store AI response
      const { error: aiMessageError } = await supabase
        .from('chat_messages')
        .insert({
          content: analysis.message,
          excel_file_id: fileId,
          user_id: userId,
          is_ai_response: true,
          openai_model: analysis.openAiResponse?.model,
          openai_usage: analysis.openAiResponse?.usage,
          raw_response: analysis.openAiResponse
        });

      if (aiMessageError) {
        console.error('Error storing AI response:', aiMessageError);
        throw aiMessageError;
      }
      
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