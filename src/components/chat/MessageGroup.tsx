
import { motion } from "framer-motion";
import { MessageContent } from "../message/MessageContent";
import { format } from "date-fns";

interface MessageGroupProps {
  date: string;
  messages: any[];
  formatTimestamp: (timestamp: string) => string;
  latestMessageId?: string;
  isStreaming?: boolean;
  isProcessing?: boolean;
}

export function MessageGroup({ 
  date, 
  messages, 
  formatTimestamp, 
  latestMessageId, 
  isStreaming,
  isProcessing 
}: MessageGroupProps) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-4 my-4">
        <div className="h-px bg-gray-200 flex-1" />
        <span className="text-xs text-gray-500 font-medium">{date}</span>
        <div className="h-px bg-gray-200 flex-1" />
      </div>
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
            isNewMessage={msg.id === latestMessageId}
            isStreaming={msg.id === latestMessageId && isStreaming && msg.role === 'assistant'}
            isProcessing={msg.id === latestMessageId && isProcessing && msg.role === 'assistant'}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
