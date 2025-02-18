
import { motion } from "framer-motion";
import { MessageContent } from "../message/MessageContent";
import { MessageStatus } from "@/types/chat";

interface MessageGroupProps {
  date: string;
  messages: any[];
  formatTimestamp: (timestamp: string) => string;
  latestMessageId?: string | null;
  status?: MessageStatus;
}

export function MessageGroup({ 
  date, 
  messages, 
  formatTimestamp, 
  latestMessageId, 
  status = 'completed'
}: MessageGroupProps) {
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
          className="group"
        >
          <MessageContent
            messageId={msg.id}
            content={msg.content}
            role={msg.role as 'user' | 'assistant'}
            timestamp={formatTimestamp(msg.created_at)}
            fileInfo={msg.excel_files}
            isNewMessage={msg.id === latestMessageId}
            status={msg.id === latestMessageId ? status : msg.status || 'completed'}
            metadata={msg.metadata}
            userReaction={null}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
