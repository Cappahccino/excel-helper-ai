import { useState, useRef, useEffect } from "react";
import { MessageMarkdown } from "./MessageMarkdown";
import { MessageAvatar } from "./MessageAvatar";
import { MessageActions } from "./MessageActions";
import { MessageLoadingState, LoadingStage } from "./MessageLoadingState";
import { ReactionButtons } from "./ReactionButtons";
import { FileInfo } from "../FileInfo";
import { motion, AnimatePresence } from "framer-motion";
import { EditableMessage } from "./EditableMessage";
import { Clock, Edit2, Trash2, Copy, Share2, Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "../ui/button";
import { formatDistance } from "date-fns";
import { cn } from "@/lib/utils";
import { MessageStatus } from "@/types/chat";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MessageContentProps {
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  fileInfo?: {
    filename: string;
    file_size: number;
  } | null;
  isNewMessage?: boolean;
  status?: MessageStatus;
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
    is_multi_file?: boolean;
    file_count?: number;
    has_code_output?: boolean;
    code_outputs?: Array<{
      type: string;
      file_id: string;
    }>;
  } | null;
  userReaction?: boolean | null;
  highlightedMessageId?: string | null;
  searchTerm?: string;
  onDelete?: (messageId: string) => Promise<void>;
  onEdit?: (messageId: string, content: string) => Promise<void>;
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
  userReaction,
  highlightedMessageId,
  searchTerm = "",
  onDelete,
  onEdit
}: MessageContentProps) {
  // State
  const [isEditing, setIsEditing] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  
  // Highlight message if it matches the highlighted ID
  const isHighlighted = highlightedMessageId === messageId;
  
  // Get loading stage
  const getLoadingStage = () => {
    if (status === 'processing') {
      const stage = metadata?.processing_stage?.stage;
      
      if (stage === 'uploading_files') {
        return LoadingStage.UploadingFiles;
      }
      
      if (stage === 'generating' && metadata?.processing_stage?.completion_percentage) {
        return `${LoadingStage.Generating} (${Math.round(metadata.processing_stage.completion_percentage)}%)` as const;
      }
      
      return stage === 'analyzing' ? LoadingStage.Analyzing 
        : stage === 'processing' ? LoadingStage.Processing
        : stage === 'generating' ? LoadingStage.Generating
        : LoadingStage.InProgress;
    }
    return LoadingStage.Processing;
  };

  // Show loading state while generating or when no content is available
  const showLoading = (
    role === "assistant" &&
    status === 'processing'
  );

  // Show content as soon as there's any content, even while still generating
  const showContent = content.trim().length > 0;
  
  // Edit history
  const editHistory = metadata?.edit_history || [];
  const hasEditHistory = editHistory.length > 0;
  const reactionCounts = metadata?.reaction_counts ?? { positive: 0, negative: 0 };
  const fileCount = metadata?.file_count || 0;

  // Save handler
  const handleSave = async (newContent: string) => {
    try {
      if (onEdit) {
        await onEdit(messageId, newContent);
      }
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving edited message:", error);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    try {
      if (onDelete) {
        await onDelete(messageId);
      }
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  // Copy message content to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
  };

  // Toggle bookmark
  const toggleBookmark = () => {
    setIsBookmarked(!isBookmarked);
    // In a real implementation, you would save this to backend storage
  };

  // Share message handler
  const shareMessage = () => {
    // This would be implemented to share a link to this message
    console.log("Share message", messageId);
  };

  // Highlight search terms in content
  useEffect(() => {
    if (!searchTerm || !messageRef.current) return;
    
    try {
      const contentElement = messageRef.current.querySelector('.message-content');
      if (!contentElement) return;
      
      // Reset any previous highlighting
      contentElement.innerHTML = contentElement.textContent || '';
      
      if (!searchTerm.trim()) return;
      
      // Use a simple text search and replace approach
      const regex = new RegExp(searchTerm, 'gi');
      contentElement.innerHTML = contentElement.textContent!.replace(
        regex,
        match => `<mark class="bg-yellow-200 px-0.5 rounded">${match}</mark>`
      );
    } catch (error) {
      console.error("Error highlighting search terms:", error);
    }
  }, [searchTerm, content]);

  return (
    <div 
      id={`message-${messageId}`}
      ref={messageRef}
      className={cn(
        "group/message relative flex gap-3", 
        role === 'assistant' ? 'items-start' : 'items-center',
        isHighlighted && "bg-yellow-50 border border-yellow-200 p-2 rounded-lg -mx-2 duration-1000 transition-colors"
      )}
    >
      <MessageAvatar role={role} />
      <div className="flex-1">
        {role === 'user' && fileInfo && (
          <FileInfo
            filename={fileInfo.filename}
            fileSize={fileInfo.file_size}
            className="mb-2"
          />
        )}
        <div className="space-y-4">
          <AnimatePresence mode="sync">
            {showLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <MessageLoadingState 
                  stage={getLoadingStage()}
                  className="shadow-sm border border-slate-200"
                  fileCount={fileCount}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {showContent && (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
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
                    <div className="message-content">
                      <MessageMarkdown content={content} />
                    </div>
                  )}
                  
                  {/* Action buttons for options */}
                  {!isEditing && role === 'user' && (
                    <div className="absolute -right-10 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu onOpenChange={setShowMoreOptions}>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>
                              Message options
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => setIsEditing(true)}>
                              <Edit2 className="mr-2 h-4 w-4" />
                              <span>Edit message</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={copyToClipboard}>
                              <Copy className="mr-2 h-4 w-4" />
                              <span>Copy message</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={toggleBookmark}>
                              {isBookmarked ? (
                                <>
                                  <BookmarkCheck className="mr-2 h-4 w-4" />
                                  <span>Remove bookmark</span>
                                </>
                              ) : (
                                <>
                                  <Bookmark className="mr-2 h-4 w-4" />
                                  <span>Add bookmark</span>
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={shareMessage}>
                              <Share2 className="mr-2 h-4 w-4" />
                              <span>Share message</span>
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => setIsDeleteDialogOpen(true)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Delete message</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                  
                  {/* Edit history */}
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
      
      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
