
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "./ui/scroll-area";
import { format } from "date-fns";
import { MessageContent } from "./MessageContent";
import { ScrollToTop } from "./ScrollToTop";
import { motion, AnimatePresence } from "framer-motion";
import { FileInfo } from "./FileInfo";
import { ChatInput } from "./ChatInput";

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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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

  // Auto-scroll when new messages are added
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (message: string, file?: File) => {
    if ((!message.trim() && !file) || isAnalyzing) return;

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
                  <div ref={messagesEndRef} />
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
        <ChatInput 
          onSendMessage={handleSendMessage}
          isAnalyzing={isAnalyzing}
        />
      </div>
    </>
  );
}
