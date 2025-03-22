
import { motion } from "framer-motion";
import { MessageContent } from "../message/MessageContent";
import { Message, MessageStatus } from "@/types/chat";
import { memo } from "react";

interface MessageGroupProps {
  date: string;
  messages: Message[];
  formatTimestamp: (timestamp: string) => string;
  latestMessageId: string | null;
  status?: MessageStatus;
  highlightedMessageId?: string | null;
  searchTerm?: string;
  onMessageDelete?: (messageId: string) => Promise<void>;
  onMessageEdit?: (messageId: string, content: string) => Promise<void>;
  onMessagePin?: (messageId: string) => void;
  onMessageUnpin?: (messageId: string) => void;
  isMessagePinned?: (messageId: string) => boolean;
}

export const MessageGroup = memo(({ 
  date, 
  messages, 
  formatTimestamp, 
  latestMessageId, 
  status = 'completed',
  highlightedMessageId,
  searchTerm,
  onMessageDelete,
  onMessageEdit,
  onMessagePin,
  onMessageUnpin,
  isMessagePinned = () => false
}: MessageGroupProps) => {
  // If there are no messages, don't render anything
  if (messages.length === 0) return null;
  
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="sticky top-0 z-10 flex items-center gap-4 my-4 bg-white/80 backdrop-blur-sm py-2">
        <div className="h-px bg-gray-200 flex-1" />
        <span className="text-xs font-medium text-gray-500 bg-white/80 px-2 rounded-full shadow-sm border border-gray-100">
          {date}
        </span>
        <div className="h-px bg-gray-200 flex-1" />
      </div>
      
      {messages.map((msg, index) => (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            delay: index * 0.1,
            type: "spring",
            stiffness: 100,
            damping: 15
          }}
          className="group/message"
          data-message-id={msg.id}
          data-message-role={msg.role}
        >
          <MessageContent
            messageId={msg.id}
            content={msg.content}
            role={msg.role}
            timestamp={formatTimestamp(msg.created_at)}
            fileInfo={msg.message_files?.[0] ? {
              filename: msg.message_files[0].filename || 'Untitled',
              file_size: msg.message_files[0].file_size || 0,
              file_id: msg.message_files[0].file_id
            } : null}
            isNewMessage={msg.id === latestMessageId}
            status={msg.id === latestMessageId ? status : msg.status || 'completed'}
            metadata={msg.metadata}
            userReaction={msg.metadata?.user_reaction}
            highlightedMessageId={highlightedMessageId}
            searchTerm={searchTerm}
            onDelete={onMessageDelete}
            onEdit={onMessageEdit}
            isPinned={isMessagePinned(msg.id)}
            onPin={onMessagePin}
            onUnpin={onMessageUnpin}
          />
        </motion.div>
      ))}
    </motion.div>
  );
});

MessageGroup.displayName = "MessageGroup";
