
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
import { motion, AnimatePresence } from "framer-motion";
import { FileInfo } from "./FileInfo";

interface ChatWindowProps {
  sessionId: string | null;
  fileId: string | null;
  fileInfo?: {
    filename: string;
    file_size: number;
  } | null;
  onMessageSent?: () => void;
}

export function ChatWindow({ sessionId, fileId, fileInfo, onMessageSent }: ChatWindowProps) {
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ['chat-session', sessionId, fileId],
    queryFn: async () => {
      if (!sessionId) return null;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

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
    <div className="flex flex-col h-full relative overflow-hidden">
      <ScrollArea className="flex-1 p-4 pb-24">
        <div className="flex flex-col gap-6">
          <AnimatePresence>
            {fileInfo && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <FileInfo 
                  filename={fileInfo.filename}
                  fileSize={fileInfo.file_size}
                  fileId={fileId || undefined}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <MessageContent
              content="Hello! Upload an Excel file and I'll help you analyze it."
              role="assistant"
              timestamp={formatTimestamp(new Date().toISOString())}
            />
          </motion.div>

          {messagesLoading && (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {messages && messages.length > 0 && (
              <motion.div 
                className="space-y-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {messages.map((msg, index) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <MessageContent
                      content={msg.content}
                      role={msg.role as 'user' | 'assistant'}
                      timestamp={formatTimestamp(msg.created_at)}
                      fileInfo={msg.excel_files}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg ml-4"
              >
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-excel"></div>
                <p className="text-sm">Analyzing your Excel file...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-0 left-0 right-0 bg-white border-t"
      >
        <div className="max-w-4xl mx-auto px-4 py-4">
          <form 
            onSubmit={handleSubmit}
            className="flex gap-3 items-center w-full bg-white rounded-xl border shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-300"
          >
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={fileId ? "Ask a follow-up question..." : "Upload an Excel file to start analyzing"}
              className="flex-1 min-w-0 px-4 py-3 bg-transparent border-none focus:outline-none text-sm placeholder:text-gray-400"
              disabled={!fileId || isAnalyzing}
            />
            <Button 
              type="submit" 
              size="sm"
              className="mr-2 bg-excel hover:bg-excel/90 transition-colors duration-200 shadow-sm"
              disabled={!fileId || isAnalyzing}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </motion.div>
      <ScrollToTop />
    </div>
  );
};
