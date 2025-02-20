
import { Message, MessageStatus } from "@/types/chat";
import { MessageGroup } from "./MessageGroup";
import { LoadingMessages } from "./LoadingMessages";
import { AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const isInitialLoad = useRef(true);
  const previousMessageCount = useRef(messages.length);

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

    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (isInitialLoad.current && messages.length > 0) {
      scrollToBottom("auto");
      isInitialLoad.current = false;
      return;
    }

    if (messages.length > previousMessageCount.current) {
      scrollToBottom("smooth");
    }

    previousMessageCount.current = messages.length;
  }, [messages]);

  const messageGroups = groupMessagesByDate(messages);
  const hasMessages = Object.keys(messageGroups).length > 0;

  return (
    <div className="relative flex-grow">
      <ScrollArea 
        ref={scrollAreaRef} 
        className={cn(
          "h-full p-4 md:p-6",
          "scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
        )}
      >
        <div className="space-y-8">
          {(!hasMessages && isLoading) ? (
            <LoadingMessages />
          ) : (
            <AnimatePresence initial={false}>
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
          className="absolute bottom-4 right-4 rounded-full shadow-lg bg-white/80 backdrop-blur-sm hover:bg-white/90 transition-all duration-200"
          onClick={() => scrollToBottom()}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
