
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "./ui/scroll-area";
import { MessageGroup } from "./chat/MessageGroup";
import { LoadingMessages } from "./chat/LoadingMessages";
import { ChatError } from "./chat/ChatError";
import { ScrollToTop } from "./ScrollToTop";
import { motion, AnimatePresence } from "framer-motion";
import { FileInfo } from "./FileInfo";
import { ChatInput } from "./ChatInput";
import { Button } from "./ui/button";
import { useChatMessages } from "@/hooks/useChatMessages";
import { ThinkingIndicator } from "./chat/ThinkingIndicator";

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
  const [hasScrolledUp, setHasScrolledUp] = useState(false);
  const [latestMessageId, setLatestMessageId] = useState<string | null>(null);
  const [pendingResponseId, setPendingResponseId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const { 
    messages, 
    session, 
    isLoading, 
    isError, 
    refetch,
    formatTimestamp,
    groupMessagesByDate,
  } = useChatMessages(sessionId);

  const scrollToBottom = (behavior: "auto" | "smooth" = "smooth") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior,
        block: "end"
      });
    }
  };

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setHasScrolledUp(!isAtBottom);
    }
  };

  useEffect(() => {
    if (!hasScrolledUp) {
      scrollToBottom("auto");
    }
  }, [messages, hasScrolledUp]);

  useEffect(() => {
    if (!session?.session_id) return;

    const channel = supabase
      .channel(`chat_${session.session_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${session.session_id}`,
        },
        async (payload: any) => {
          if (payload.new && payload.new.role === 'assistant') {
            setLatestMessageId(payload.new.id);
            setIsAnalyzing(false);
            setPendingResponseId(null);
          }
          await queryClient.invalidateQueries({ 
            queryKey: ['chat-messages', session.session_id] 
          });
          await queryClient.invalidateQueries({ 
            queryKey: ['chat-session', session.session_id] 
          });
          if (!hasScrolledUp) {
            scrollToBottom();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.session_id, queryClient, hasScrolledUp]);

  const handleSendMessage = async (message: string, fileId?: string | null) => {
    if ((!message.trim() && !fileId) || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      setPendingResponseId(Date.now().toString());
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Create or get session
      let currentSessionId = session?.session_id;
      
      if (!currentSessionId) {
        const { data: newSession, error: sessionError } = await supabase
          .from('chat_sessions')
          .insert([{ 
            user_id: user.id,
            status: 'active'
            // No thread_id here - it will be set by the edge function
          }])
          .select('session_id')
          .single();

        if (sessionError) throw sessionError;
        currentSessionId = newSession.session_id;
      }

      // Optimistically add user message to the UI
      const optimisticUserMessage = {
        id: Date.now().toString(),
        content: message,
        role: 'user',
        created_at: new Date().toISOString(),
        session_id: currentSessionId,
      };
      
      queryClient.setQueryData(['chat-messages', currentSessionId], (old: any) => 
        [...(old || []), optimisticUserMessage]
      );
      
      const { data: analysis, error } = await supabase.functions
        .invoke('excel-assistant', {
          body: { 
            fileId: fileId || null, 
            query: message,
            userId: user.id,
            sessionId: currentSessionId,
            threadId: session?.thread_id // Pass existing thread_id if it exists
          }
        });

      if (error) throw error;
      
      onMessageSent?.();
      
      // Update queries to reflect changes
      queryClient.invalidateQueries({ queryKey: ['chat-messages', currentSessionId] });
      queryClient.invalidateQueries({ queryKey: ['chat-session', currentSessionId] });
      
    } catch (error) {
      console.error('Analysis error:', error);
      setIsAnalyzing(false);
      setPendingResponseId(null);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze request",
        variant: "destructive",
      });
    }
  };

  if (isError) {
    return <ChatError onRetry={refetch} />;
  }

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex flex-col h-full relative max-w-4xl mx-auto w-full">
      <ScrollArea 
        className="flex-1 p-4 pb-24"
        onScroll={handleScroll}
      >
        <div className="flex flex-col gap-6" ref={chatContainerRef}>
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

          {isLoading ? (
            <LoadingMessages />
          ) : (
            <AnimatePresence>
              {Object.entries(messageGroups).map(([date, groupMessages]) => (
                <MessageGroup
                  key={date}
                  date={date}
                  messages={groupMessages}
                  formatTimestamp={formatTimestamp}
                  latestMessageId={latestMessageId}
                />
              ))}
              {isAnalyzing && <ThinkingIndicator />}
              <div ref={messagesEndRef} />
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>

      {hasScrolledUp && (
        <Button
          onClick={() => {
            scrollToBottom();
            setHasScrolledUp(false);
          }}
          className="absolute bottom-24 right-4 bg-excel hover:bg-excel/90 text-white shadow-lg"
          size="sm"
        >
          Scroll to Bottom
        </Button>
      )}
      
      <ScrollToTop />
      
      <div className="absolute bottom-0 left-0 right-0">
        <ChatInput 
          onSendMessage={handleSendMessage}
          isAnalyzing={isAnalyzing}
          sessionId={sessionId}
        />
      </div>
    </div>
  );
}
