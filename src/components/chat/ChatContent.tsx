
import { useState, useCallback } from "react";
import { Message, MessageStatus } from "@/types/chat";
import { MessageGroup } from "./MessageGroup";
import { EmptyState } from "./EmptyState";
import { LoadingMessages } from "./LoadingMessages";

interface ChatContentProps {
  messages: Message[];
  isLoading: boolean;
  formatTimestamp: (timestamp: string) => string;
  groupMessagesByDate: (messages: Message[]) => Record<string, Message[]>;
  latestMessageId: string | null;
  status?: MessageStatus;
  searchTerm?: string;
  highlightedMessageId?: string | null;
  onMessageDelete?: (messageId: string) => Promise<void>;
  onMessageEdit?: (messageId: string, content: string) => Promise<void>;
  onMessagePin?: (messageId: string) => void;
  onMessageUnpin?: (messageId: string) => void;
  isMessagePinned?: (messageId: string) => boolean;
}

export function ChatContent({
  messages,
  isLoading,
  formatTimestamp,
  groupMessagesByDate,
  latestMessageId,
  status = 'completed',
  searchTerm = "",
  highlightedMessageId,
  onMessageDelete,
  onMessageEdit,
  onMessagePin,
  onMessageUnpin,
  isMessagePinned = () => false
}: ChatContentProps) {
  // Group messages by date
  const messagesByDate = groupMessagesByDate(messages);
  const dates = Object.keys(messagesByDate);

  // Handle message deletion with confirmation
  const handleMessageDelete = useCallback(async (messageId: string) => {
    if (onMessageDelete) {
      try {
        await onMessageDelete(messageId);
      } catch (error) {
        console.error("Error deleting message:", error);
      }
    }
  }, [onMessageDelete]);

  // Handle message editing
  const handleMessageEdit = useCallback(async (messageId: string, content: string) => {
    if (onMessageEdit) {
      try {
        await onMessageEdit(messageId, content);
      } catch (error) {
        console.error("Error editing message:", error);
      }
    }
  }, [onMessageEdit]);

  // If loading and no messages, show loading skeleton
  if (isLoading && messages.length === 0) {
    return <LoadingMessages />;
  }

  // If no messages, show empty state
  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      {dates.map((date) => (
        <MessageGroup
          key={date}
          date={date}
          messages={messagesByDate[date]}
          formatTimestamp={formatTimestamp}
          latestMessageId={latestMessageId}
          status={status}
          highlightedMessageId={highlightedMessageId}
          searchTerm={searchTerm}
          onMessageDelete={handleMessageDelete}
          onMessageEdit={handleMessageEdit}
          onMessagePin={onMessagePin}
          onMessageUnpin={onMessageUnpin}
          isMessagePinned={isMessagePinned}
        />
      ))}
    </div>
  );
}
