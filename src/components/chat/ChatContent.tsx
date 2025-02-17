
import { Message, MessageStatus } from "@/types/chat";
import { MessageGroup } from "./MessageGroup";
import { LoadingMessages } from "./LoadingMessages";
import { AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface ChatContentProps {
  messages: Message[];
  isLoading: boolean;
  formatTimestamp: (timestamp: string) => string;
  groupMessagesByDate: (messages: Message[]) => Record<string, Message[]>;
  latestMessageId: string | null;
  status: MessageStatus;
}

export function ChatContent({
  messages,
  isLoading,
  formatTimestamp,
  groupMessagesByDate,
  latestMessageId,
  status
}: ChatContentProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior
      });
    }
  };

  const handleScroll = () => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (!viewport) return;

    const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  };

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (!viewport) return;

    // Add scroll event listener
    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (!viewport) return;

    const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
    
    // Only auto-scroll if:
    // 1. User is already near bottom
    // 2. A new message is completed
    // 3. This is the initial load
    if (isNearBottom || (latestMessageId && status === 'completed') || messages.length === 1) {
      scrollToBottom(messages.length === 1 ? "auto" : "smooth");
    }
  }, [messages, latestMessageId, status]);

  const messageGroups = groupMessagesByDate(messages);
  const hasMessages = Object.keys(messageGroups).length > 0;

  return (
    <div className="relative flex-grow">
      <ScrollArea ref={scrollAreaRef} className="h-full p-4">
        <div className="space-y-6">
          {(!hasMessages && isLoading) ? (
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
                  status={status}
                />
              ))}
              <div ref={messagesEndRef} />
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
      
      {showScrollButton && (
        <Button
          size="icon"
          variant="secondary"
          className="absolute bottom-4 right-4 rounded-full shadow-lg"
          onClick={() => scrollToBottom()}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
