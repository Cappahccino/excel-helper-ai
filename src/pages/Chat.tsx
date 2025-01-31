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
  const { data: messages, isLoading: messagesLoading } = useQuery({
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
    if (!message.trim() || !fileId) return;

    try {
      const { data: analysis, error } = await supabase.functions
        .invoke('analyze-excel', {
          body: { fileId, query: message }
        });

      if (error) throw error;

      setMessage("");
    } catch (error) {
      console.error('Query error:', error);
      toast({
        title: "Query Failed",
        description: error instanceof Error ? error.message : "Failed to process query",
        variant: "destructive",
      });
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

          {fileId && (
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm font-mono">File ID: {fileId}</p>
              <p className="text-xs mt-2">Use this payload to test the Lambda function:</p>
              <pre className="bg-black text-white p-2 rounded mt-1 text-xs overflow-x-auto">
{JSON.stringify({
  body: JSON.stringify({
    fileId: fileId,
    query: "Please analyze this Excel file"
  })
}, null, 2)}
              </pre>
            </div>
          )}

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
                      ? "bg-blue-900/20 ml-4"
                      : "bg-gray-800/50 mr-4"
                  }`}
                >
                  {message.content}
                </div>
              ))}
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
            disabled={!fileId || isUploading}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
};

export default Chat;