
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
    if (!message.trim() || isAnalyzing) return;

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
      
      // Invalidate queries to refresh the messages
      queryClient.invalidateQueries({ queryKey: ['chat-messages', session?.session_id] });
      queryClient.invalidateQueries({ queryKey: ['chat-session', sessionId, fileId] });
      
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze request",
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
    <>
      <div className="flex flex-col h-full relative max-w-4xl mx-auto w-full">
        <ScrollArea className="flex-1 p-4 pb-24">
          <div className="flex flex-col gap-6">
            <AnimatePresence>
              {fileInfo && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.2 }}
                  className="mb-6"
                >
                  <FileInfo 
                    filename={fileInfo.filename}
                    fileSize={fileInfo.file_size}
                    fileId={fileId || undefined}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
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
                  <p className="text-sm">Processing your request...</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
        <ScrollToTop />
      </div>
      
      <div className="absolute bottom-0 left-0 right-0">
        <div className="max-w-4xl mx-auto px-4 pb-4">
          <form onSubmit={handleSubmit} className="flex gap-2 items-center w-full bg-white rounded-lg border shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-300 p-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
              placeholder="Ask me anything..."
              className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-sm placeholder:text-gray-400"
              disabled={isAnalyzing}
            />
            <Button 
              type="submit"
              size="sm"
              className="bg-excel hover:bg-excel/90 transition-colors duration-200 shadow-sm h-8 w-8 p-0"
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
