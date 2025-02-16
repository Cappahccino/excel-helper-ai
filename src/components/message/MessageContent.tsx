
import { MessageMarkdown } from "./MessageMarkdown";
import { MessageAvatar } from "./MessageAvatar";
import { MessageActions } from "./MessageActions";
import { MessageLoadingState } from "./MessageLoadingState";
import { FileInfo } from "../FileInfo";
import { motion, AnimatePresence } from "framer-motion";

interface MessageContentProps {
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  fileInfo?: {
    filename: string;
    file_size: number;
  } | null;
  isNewMessage?: boolean;
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
  // Show thinking state only if:
  // 1. It's an assistant message
  // 2. There's no content AND it's processing
  const isThinking = role === 'assistant' && !content && isProcessing;

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
          <motion.div
            key={isThinking ? "loading" : "content"}
            initial={{ opacity: 0, height: 0 }}
            animate={{ 
              opacity: 1, 
              height: "auto",
              transition: {
                height: { duration: 0.2 },
                opacity: { duration: 0.15, delay: 0.05 }
              }
            }}
            exit={{ 
              opacity: 0,
              height: 0,
              transition: {
                height: { duration: 0.2 },
                opacity: { duration: 0.1 }
              }
            }}
            className="min-h-[40px] overflow-hidden"
          >
            {isThinking ? (
              <MessageLoadingState />
            ) : content && (
              <>
                <div className="prose prose-slate max-w-none">
                  <MessageMarkdown content={content} />
                </div>
                <MessageActions content={content} timestamp={timestamp} />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
