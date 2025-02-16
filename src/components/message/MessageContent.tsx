
import { MessageMarkdown } from "./MessageMarkdown";
import { MessageAvatar } from "./MessageAvatar";
import { MessageActions } from "./MessageActions";
import { MessageLoadingState } from "./MessageLoadingState";
import { FileInfo } from "../FileInfo";
import { AnimatePresence, motion } from "framer-motion";

interface MessageContentProps {
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  fileInfo?: {
    filename: string;
    file_size: number;
  } | null;
  isNewMessage?: boolean;
  isStreaming?: boolean;
  isProcessing?: boolean;
}

export function MessageContent({ 
  content, 
  role, 
  timestamp,
  fileInfo,
  isNewMessage,
  isProcessing
}: MessageContentProps) {
  // Only show thinking state when there's no content and message is processing
  const showThinking = role === 'assistant' && !content && isProcessing;

  return (
    <div className={`group relative flex gap-3 ${role === 'assistant' ? 'items-start' : 'items-center'}`}>
      <MessageAvatar role={role} />
      <div className="flex-1">
        {role === 'user' && fileInfo && (
          <FileInfo
            filename={fileInfo.filename}
            fileSize={fileInfo.file_size}
            className="mb-2"
          />
        )}
        <AnimatePresence mode="wait">
          {content ? (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="prose prose-slate max-w-none">
                <MessageMarkdown content={content} />
              </div>
              <MessageActions content={content} timestamp={timestamp} />
            </motion.div>
          ) : showThinking ? (
            <motion.div
              key="thinking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MessageLoadingState />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
