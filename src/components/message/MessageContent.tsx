
import { MessageMarkdown } from "./MessageMarkdown";
import { MessageAvatar } from "./MessageAvatar";
import { MessageActions } from "./MessageActions";
import { MessageLoadingState } from "./MessageLoadingState";
import { ReactionButtons } from "./ReactionButtons";
import { FileInfo } from "../FileInfo";
import { motion, AnimatePresence } from "framer-motion";
import { EditableMessage } from "./EditableMessage";
import { useState } from "react";
import { Clock, Edit2 } from "lucide-react";
import { Button } from "../ui/button";
import { formatDistance } from "date-fns";
import { cn } from "@/lib/utils";

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
    edit_history?: Array<{
      previous_content: string;
      edited_at: string;
    }>;
    processing_stage?: {
      stage: string;
      started_at: number;
      last_updated: number;
      completion_percentage?: number;
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
  const [isEditing, setIsEditing] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
  
  const getLoadingStage = () => {
    if (status === 'queued') return 'analyzing';
    if (status === 'in_progress') {
      const stage = metadata?.processing_stage?.stage;
      if (stage === 'generating' && metadata?.processing_stage?.completion_percentage) {
        return `generating (${Math.round(metadata.processing_stage.completion_percentage)}%)`;
      }
      return stage || 'processing';
    }
    return null;
  };

  // Updated logic to determine if we should show the loading state
  const isThinking = (
    role === "assistant" &&
    (status === 'queued' || (status === 'in_progress' && !content.trim()))
  );

  const showContent = content.trim().length > 0 && (!isThinking || status === 'completed');
  const editHistory = metadata?.edit_history || [];
  const hasEditHistory = editHistory.length > 0;
  const reactionCounts = metadata?.reaction_counts ?? { positive: 0, negative: 0 };

  const handleSave = (newContent: string) => {
    setIsEditing(false);
  };

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
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <MessageLoadingState 
                stage={getLoadingStage()}
                className="shadow-sm border border-slate-200"
              />
            </motion.div>
          ) : showContent && (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ 
                duration: 0.3,
                ease: [0.4, 0, 0.2, 1]
              }}
              className={cn(
                "relative",
                isNewMessage && "animate-highlight"
              )}
            >
              <div className="prose prose-slate max-w-none relative group">
                {isEditing ? (
                  <EditableMessage
                    content={content}
                    messageId={messageId}
                    onCancel={() => setIsEditing(false)}
                    onSave={handleSave}
                  />
                ) : (
                  <>
                    <MessageMarkdown content={content} />
                    {role === 'user' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -right-10 top-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setIsEditing(true)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
                {hasEditHistory && !isEditing && (
                  <div className="mt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700"
                      onClick={() => setShowEditHistory(!showEditHistory)}
                    >
                      <Clock className="h-3 w-3" />
                      Edited {editHistory.length} {editHistory.length === 1 ? 'time' : 'times'}
                    </Button>
                    {showEditHistory && (
                      <div className="mt-2 space-y-2">
                        {editHistory.map((edit, index) => (
                          <div key={index} className="text-sm text-gray-600 border-l-2 border-gray-200 pl-2">
                            <div className="text-xs text-gray-400">
                              {formatDistance(new Date(parseInt(edit.edited_at) * 1000), new Date(), { addSuffix: true })}
                            </div>
                            <MessageMarkdown content={edit.previous_content} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
