
import { motion } from "framer-motion";
import { MessageContent } from "../message/MessageContent";

interface MessageGroupProps {
  date: string;
  messages: any[];
  formatTimestamp: (timestamp: string) => string;
  latestMessageId?: string | null;
  status?: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';
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
            status={msg.id === latestMessageId ? status : msg.status || 'completed'}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
