
import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "./ui/scroll-area";
import { format } from "date-fns";

interface ChatWindowProps {
  threadId: string | null;
  fileId: string | null;
  onMessageSent?: () => void;
}

export function ChatWindow({ threadId, fileId, onMessageSent }: ChatWindowProps) {
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ['chat-messages', threadId || fileId],
    queryFn: async () => {
      if (!threadId && !fileId) return [];
      
      // Query both by session_id and excel_file_id to get complete history
      let query = supabase
        .from('chat_messages')
        .select('*, excel_files(filename)')
        .order('created_at', { ascending: true });

      if (threadId) {
        query = query.eq('session_id', threadId);
      } else if (fileId) {
        query = query.eq('excel_file_id', fileId);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }
      return data;
    },
    enabled: !!(threadId || fileId),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !fileId || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { data: analysis, error } = await supabase.functions
        .invoke('excel-assistant', {
          body: { 
            fileId, 
            query: message,
            userId: user.id,
            threadId
          }
        });

      if (error) throw error;
      setMessage("");
      onMessageSent?.();
      
      // Invalidate the messages query to refresh the chat
      queryClient.invalidateQueries({ queryKey: ['chat-messages', threadId || fileId] });
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

  const formatTimestamp = (timestamp: string) => {
    return format(new Date(timestamp), 'MMM d, yyyy HH:mm');
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col gap-4">
          <div className="bg-muted p-3 rounded-lg max-w-[80%]">
            <p className="text-sm">
              Hello! Upload an Excel file and I'll help you analyze it.
              {fileId && "You can ask follow-up questions about your data!"}
            </p>
          </div>

          {messagesLoading && (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
            </div>
          )}

          {messages && messages.length > 0 && (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-4 rounded-lg ${
                    msg.role === 'assistant'
                      ? "bg-blue-50 ml-4"
                      : "bg-gray-50 mr-4"
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(msg.created_at)}
                    </span>
                  </div>
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
      </ScrollArea>
      
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={fileId ? "Ask a follow-up question..." : "Upload an Excel file to start analyzing"}
            className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={!fileId || isAnalyzing}
          />
          <Button 
            type="submit" 
            className="bg-excel hover:bg-excel/90"
            disabled={!fileId || isAnalyzing}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
