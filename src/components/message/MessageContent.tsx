
import { MessageMarkdown } from "./MessageMarkdown";
import { MessageAvatar } from "./MessageAvatar";
import { MessageActions } from "./MessageActions";
import { MessageLoadingState } from "./MessageLoadingState";
import { ReactionButtons } from "./ReactionButtons";
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
  status?: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';
  messageId: string;
  metadata?: {
    reaction_counts?: {
      positive: number;
      negative: number;
    };
  } | null;
  userReaction?: boolean | null;
}

export function MessageContent({ 
  content, 
  role, 
  timestamp,
  fileInfo,
  isNewMessage,
  status = 'completed',
  messageId,
  metadata,
  userReaction
}: MessageContentProps) {
  const isThinking = (
    role === "assistant" &&
    status === "in_progress" &&
    content.trim().length === 0
  );
  const showContent = !isThinking && content.trim().length > 0;

  const reactionCounts = metadata?.reaction_counts ?? { positive: 0, negative: 0 };

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
        <AnimatePresence mode="wait" initial={false}>
          {isThinking ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MessageLoadingState />
            </motion.div>
          ) : showContent && (
            <motion.div
              key="content"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="prose prose-slate max-w-none">
                <MessageMarkdown content={content} />
              </div>
              <div className="flex items-center justify-between mt-2">
                <MessageActions content={content} timestamp={timestamp} />
                <ReactionButtons
                  messageId={messageId}
                  initialCounts={reactionCounts}
                  userReaction={userReaction}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
