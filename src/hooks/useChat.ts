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

      const { data: analysis, error: analysisError } = await supabase.functions
        .invoke('analyze-excel', {
          body: { 
            excel_file_id: fileId,
            query: message,
            user_id: userId
          }
        });

      if (analysisError) {
        console.error('Analysis error:', analysisError);
        throw analysisError;
      }

      console.log('Analysis completed:', analysis);
      
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