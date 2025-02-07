
import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "./ui/scroll-area";
import { format } from "date-fns";
import { MessageContent } from "./MessageContent";
import { ScrollToTop } from "./ScrollToTop";

interface ChatWindowProps {
  sessionId: string | null;
  fileId: string | null;
  onMessageSent?: () => void;
}

export function ChatWindow({ sessionId, fileId, onMessageSent }: ChatWindowProps) {
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query to get or establish session
  const { data: session } = useQuery({
    queryKey: ['chat-session', sessionId, fileId],
    queryFn: async () => {
      if (!sessionId) return null;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get existing session
      const { data: sessionData, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('session_id, thread_id')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (sessionError) {
        console.error('Error fetching session:', sessionError);
        throw sessionError;
      }

      return sessionData;
    },
    enabled: !!sessionId,
  });

  // Query to get messages for the session
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['chat-messages', session?.session_id],
    queryFn: async () => {
      if (!session?.session_id) return [];
      
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, excel_files(filename, file_size)')
        .eq('session_id', session.session_id)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }
      return data;
    },
    enabled: !!session?.session_id,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !fileId || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      console.log('Sending analysis request with session:', session?.session_id, 'thread:', session?.thread_id);
      
      const { data: analysis, error } = await supabase.functions
        .invoke('excel-assistant', {
          body: { 
            fileId, 
            query: message,
            userId: user.id,
            threadId: session?.thread_id,
            sessionId: session?.session_id
          }
        });

      if (error) throw error;
      
      setMessage("");
      onMessageSent?.();
      
      // Invalidate both queries to refresh the chat
      queryClient.invalidateQueries({ queryKey: ['chat-messages', session?.session_id] });
      queryClient.invalidateQueries({ queryKey: ['chat-session', sessionId, fileId] });
      
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

  const isInputDisabled = !fileId || isAnalyzing;

  return (
    <>
      <div className="flex flex-col h-full relative">
        <ScrollArea className="flex-1 p-4 pb-24">
          <div className="flex flex-col gap-4">
            <MessageContent
              content="Hello! Upload an Excel file and I'll help you analyze it."
              role="assistant"
              timestamp={formatTimestamp(new Date().toISOString())}
            />

            {messagesLoading && (
              <div className="flex items-center justify-center p-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
              </div>
            )}

            {messages && messages.length > 0 && (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <MessageContent
                    key={msg.id}
                    content={msg.content}
                    role={msg.role as 'user' | 'assistant'}
                    timestamp={formatTimestamp(msg.created_at)}
                    fileInfo={msg.excel_files}
                  />
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
        <ScrollToTop />
      </div>
      
      <form 
        onSubmit={handleSubmit} 
        className="fixed bottom-0 left-0 right-0 mx-auto p-4 max-w-4xl bg-white/80 backdrop-blur-sm shadow-lg border-t"
      >
        <div className="flex gap-2 items-center max-w-full px-4">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={fileId ? "Ask a follow-up question..." : "Upload an Excel file to start analyzing"}
            className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={isInputDisabled}
          />
          <Button 
            type="submit" 
            className="bg-excel hover:bg-excel/90"
            disabled={isInputDisabled}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </>
  );
}
