
import { AnimatePresence, motion } from "framer-motion";
import { FileInfo } from "../FileInfo";
import { MessageGroup } from "./MessageGroup";
import { LoadingMessages } from "./LoadingMessages";
import { LoadingState } from "./LoadingState";

interface ChatContentProps {
  isLoading: boolean;
  fileInfo?: { filename: string; file_size: number } | null;
  fileId: string | null;
  messageGroups: Record<string, any[]>;
  formatTimestamp: (timestamp: string) => string;
  latestMessageId: string | null;
  isAnalyzing: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export function ChatContent({
  isLoading,
  fileInfo,
  fileId,
  messageGroups,
  formatTimestamp,
  latestMessageId,
  isAnalyzing,
  messagesEndRef
}: ChatContentProps) {
  return (
    <div className="flex flex-col gap-6">
      <AnimatePresence>
        {fileInfo && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="mb-6"
          >
            <FileInfo 
              filename={fileInfo.filename}
              fileSize={fileInfo.file_size}
              fileId={fileId || undefined}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
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
            />
          ))}
          {isAnalyzing && <LoadingState />}
          <div ref={messagesEndRef} />
        </AnimatePresence>
      )}
    </div>
  );
}
