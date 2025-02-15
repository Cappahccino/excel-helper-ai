
import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "./ui/scroll-area";
import { ChatError } from "./chat/ChatError";
import { ScrollToTop } from "./ScrollToTop";
import { ChatInput } from "./ChatInput";
import { Button } from "./ui/button";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useChatScroll } from "@/hooks/useChatScroll";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { ChatContent } from "./chat/ChatContent";

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

  const {
    hasScrolledUp,
    setHasScrolledUp,
    scrollToBottom,
    handleScroll
  } = useChatScroll({
    messages,
    messagesEndRef,
    chatContainerRef
  });

  const { latestMessageId, isStreaming } = useChatRealtime({
    sessionId: session?.session_id || null,
    onAssistantMessage: () => {
      setIsAnalyzing(false);
      if (!hasScrolledUp) {
        scrollToBottom("smooth");
      }
    }
  });

  const handleSendMessage = async (message: string, fileId?: string | null) => {
    if ((!message.trim() && !fileId) || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      let currentSessionId = session?.session_id;
      
      if (!currentSessionId) {
        const { data: newSession, error: sessionError } = await supabase
          .from('chat_sessions')
          .insert([{ 
            user_id: user.id,
            status: 'active'
          }])
          .select('session_id')
          .single();

        if (sessionError) throw sessionError;
        currentSessionId = newSession.session_id;
      }

      const { error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          content: message,
          role: 'user',
          session_id: currentSessionId,
          excel_file_id: fileId || null,
          is_ai_response: false,
          user_id: user.id
        });
      
      if (messageError) throw messageError;
      
      setHasScrolledUp(false);
      scrollToBottom("smooth");
      
      const { error } = await supabase.functions
        .invoke('excel-assistant', {
          body: { 
            fileId: fileId || null, 
            query: message,
            userId: user.id,
            sessionId: currentSessionId,
            threadId: session?.thread_id
          }
        });

      if (error) throw error;
      
      onMessageSent?.();
      
    } catch (error) {
      console.error('Analysis error:', error);
      setIsAnalyzing(false);
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
      <div className="flex-1 overflow-hidden" ref={chatContainerRef}>
        <ScrollArea 
          className="h-full"
          onScroll={handleScroll}
        >
          <div className="p-4 pb-24">
            <ChatContent
              isLoading={isLoading}
              fileInfo={fileInfo}
              fileId={fileId}
              messageGroups={messageGroups}
              formatTimestamp={formatTimestamp}
              latestMessageId={latestMessageId}
              isAnalyzing={isAnalyzing}
              isStreaming={isStreaming}
              messagesEndRef={messagesEndRef}
            />
          </div>
        </ScrollArea>
      </div>

      {hasScrolledUp && (
        <Button
          onClick={() => {
            setHasScrolledUp(false);
            scrollToBottom("smooth");
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
