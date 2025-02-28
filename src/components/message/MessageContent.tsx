
import { MessageMarkdown } from "./MessageMarkdown";
import { MessageAvatar } from "./MessageAvatar";
import { MessageActions } from "./MessageActions";
import { MessageLoadingState, LoadingStage } from "./MessageLoadingState";
import { ReactionButtons } from "./ReactionButtons";
import { FileInfo } from "../FileInfo";
import { motion, AnimatePresence } from "framer-motion";
import { EditableMessage } from "./EditableMessage";
import { useState } from "react";
import { Clock, Edit2, Download, ExternalLink, Image } from "lucide-react";
import { Button } from "../ui/button";
import { formatDistance } from "date-fns";
import { cn } from "@/lib/utils";
import { MessageStatus } from "@/types/chat";
import { MessageImage } from "@/types/messages.types";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "@/hooks/use-toast";

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
    images?: MessageImage[];
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
  const [loadingImages, setLoadingImages] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  
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
  
  const editHistory = metadata?.edit_history || [];
  const hasEditHistory = editHistory.length > 0;
  const reactionCounts = metadata?.reaction_counts ?? { positive: 0, negative: 0 };
  const fileCount = metadata?.file_count || 0;
  const images = metadata?.images || [];
  const hasImages = images.length > 0;

  const handleSave = (newContent: string) => {
    setIsEditing(false);
  };

  const handleViewImage = async (image: MessageImage) => {
    try {
      setLoadingImages(prev => ({ ...prev, [image.file_id]: true }));
      
      // Get the file ID
      const openaiFileId = image.file_id;
      if (!openaiFileId) {
        throw new Error('No file ID available');
      }
      
      // Open in new tab - the backend will need to handle authentication and serving the image
      window.open(`/api/images/${openaiFileId}`, '_blank');
      
    } catch (error) {
      console.error('Error viewing image:', error);
      toast({
        title: "Error",
        description: "Failed to load image. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoadingImages(prev => ({ ...prev, [image.file_id]: false }));
    }
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
                  
                  {/* Display any generated images */}
                  {hasImages && (
                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        <span>Generated Images</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {images.map((image, index) => (
                          <div 
                            key={image.file_id} 
                            className="border border-gray-200 rounded-md overflow-hidden shadow-sm bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                            onClick={() => handleViewImage(image)}
                          >
                            <div className="p-3 flex justify-between items-center">
                              <span className="text-sm font-medium text-gray-700">
                                Image {index + 1}
                              </span>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewImage(image);
                                  }}
                                  disabled={loadingImages[image.file_id]}
                                >
                                  {loadingImages[image.file_id] ? (
                                    <Skeleton className="h-4 w-4 rounded-full animate-spin" />
                                  ) : (
                                    <ExternalLink className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            <div className="p-4 border-t border-gray-200 bg-white flex items-center justify-center">
                              <div className="text-center text-sm text-gray-500 flex items-center gap-2">
                                <Image className="h-4 w-4" />
                                <span>Click to view image</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
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
    </div>
  );
}
