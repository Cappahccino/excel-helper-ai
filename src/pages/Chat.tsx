import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ExcelPreview } from "@/components/ExcelPreview";
import { FileUploadZone } from "@/components/FileUploadZone";
import { useFileUpload } from "@/hooks/useFileUpload";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const Chat = () => {
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();
  const {
    file: uploadedFile,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileId,
  } = useFileUpload();

  // Fetch chat messages
  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ['chat-messages', fileId],
    queryFn: async () => {
      if (!fileId) return [];
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('excel_file_id', fileId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!fileId,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !fileId || isAnalyzing) return;

    try {
      setIsAnalyzing(true);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Save user message
      const { error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          content: message,
          excel_file_id: fileId,
          is_ai_response: false,
          user_id: user.id
        });

      if (messageError) throw messageError;

      // Call analyze-excel function with all required parameters
      const { data: analysis, error } = await supabase.functions
        .invoke('analyze-excel', {
          body: { 
            fileId, 
            query: message,
            userId: user.id 
          }
        });

      if (error) throw error;

      // Save AI response
      const { error: aiMessageError } = await supabase
        .from('chat_messages')
        .insert({
          content: analysis.message,
          excel_file_id: fileId,
          is_ai_response: true,
          user_id: user.id,
          openai_model: analysis.model,
          openai_usage: analysis.usage,
          raw_response: analysis
        });

      if (aiMessageError) throw aiMessageError;

      // Refetch messages to show the new ones
      await refetchMessages();
      setMessage("");
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

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border">
      <div className="h-[600px] p-4 overflow-y-auto">
        <div className="flex flex-col gap-4">
          <div className="bg-muted p-3 rounded-lg max-w-[80%]">
            <p className="text-sm">
              Hello! Upload an Excel file and I'll help you analyze it.
            </p>
          </div>
          
          <FileUploadZone
            onFileUpload={handleFileUpload}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            currentFile={uploadedFile}
            onReset={resetUpload}
          />

          {uploadedFile && !isUploading && (
            <div className="w-full">
              <ExcelPreview file={uploadedFile} />
            </div>
          )}

          {messagesLoading && (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
            </div>
          )}

          {messages && messages.length > 0 && (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`p-4 rounded-lg ${
                    message.is_ai_response
                      ? "bg-blue-50 ml-4"
                      : "bg-gray-50 mr-4"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              ))}
            </div>
          )}

          {isAnalyzing && (
            <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg ml-4">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-excel"></div>
              <p className="text-sm">Analyzing your Excel file...</p>
            </div>
          )}
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about your Excel file..."
            className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Message input"
          />
          <Button 
            type="submit" 
            className="bg-excel hover:bg-excel/90"
            aria-label="Send message"
            disabled={!fileId || isUploading || isAnalyzing}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
};

export default Chat;