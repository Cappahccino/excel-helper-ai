
import { Message, MessageStatus } from "@/types/chat";
import { MessageGroup } from "./MessageGroup";
import { LoadingMessages } from "./LoadingMessages";
import { AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRef, useEffect } from "react";

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const messageGroups = groupMessagesByDate(messages);
  const hasMessages = Object.keys(messageGroups).length > 0;

  return (
    <ScrollArea className="flex-grow p-4">
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
  );
}
