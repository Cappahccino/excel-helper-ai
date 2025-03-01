
import { useRef } from "react";
import { ScrollArea } from "./ui/scroll-area";
import { ChatError } from "./chat/ChatError";
import { ScrollToTop } from "./ScrollToTop";
import { ChatInput } from "./ChatInput";
import { Button } from "./ui/button";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { useChatScroll } from "@/hooks/useChatScroll";
import { ChatContent } from "./chat/ChatContent";

interface ChatWindowProps {
  sessionId: string | null;
  fileIds: string[] | null;
  fileInfo?: {
    filename: string;
    file_size: number;
  } | null;
  onMessageSent?: () => void;
}

export function ChatWindow({ 
  sessionId, 
  fileIds, 
  fileInfo, 
  onMessageSent 
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading,
    isError,
    sendMessage: sendMessageMutation,
    formatTimestamp,
    groupMessagesByDate,
    refetch
  } = useChatMessages(sessionId);

  const {
    hasScrolledUp,
    scrollToBottom,
    handleScroll
  } = useChatScroll({
    messages,
    messagesEndRef,
    chatContainerRef
  });

  const { status, latestMessageId } = useChatRealtime({
    sessionId: sessionId || null,
    refetch,
    onAssistantMessage: () => {
      if (!hasScrolledUp) {
        scrollToBottom("smooth");
      }
    }
  });

  const handleSendMessage = async (message: string, fileIds?: string[] | null) => {
    await sendMessageMutation.mutateAsync({ content: message, fileIds });
    onMessageSent?.();
  };

  if (isError) {
    return <ChatError onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col h-full relative max-w-4xl mx-auto w-full">
      <div className="flex-1 overflow-hidden" ref={chatContainerRef}>
        <ScrollArea 
          className="h-full"
          onScroll={(e: React.UIEvent<HTMLDivElement>) => handleScroll(e)}
        >
          <div className="p-4 pb-24">
            <ChatContent
              messages={messages}
              isLoading={isLoading}
              formatTimestamp={formatTimestamp}
              groupMessagesByDate={groupMessagesByDate}
              latestMessageId={latestMessageId}
              status={status}
            />
          </div>
        </ScrollArea>
      </div>

      {hasScrolledUp && (
        <Button
          onClick={() => {
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
          isAnalyzing={status === 'processing'}
          sessionId={sessionId}
          fileInfo={fileInfo}
        />
      </div>
    </div>
  );
}
