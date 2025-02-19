
import { useState, useRef, useEffect } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { toast } from "@/hooks/use-toast";
import { FileUploadWithTags } from "./shared/FileUploadWithTags";
import { Tag } from "@/types/tags";

interface ChatInputProps {
  onSendMessage: (message: string, fileIds?: string[] | null) => void;
  isAnalyzing: boolean;
  sessionId?: string | null;
  fileInfo?: {
    filename: string;
    file_size: number;
  } | null;
}

export function ChatInput({
  onSendMessage,
  isAnalyzing,
  sessionId,
  fileInfo
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    handleFileUpload,
    isUploading,
    uploadProgress,
    files: currentFiles,
    resetUpload,
    fileIds,
  } = useChatFileUpload();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleFileUploadWithTags = async (files: File[], tags: Tag[]) => {
    try {
      await handleFileUpload(files, sessionId);
      // Note: Tags will be handled by the FileUploadWithTags component
    } catch (error) {
      console.error("File upload error:", error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive"
      });
    }
  };

  const handleSubmit = () => {
    if ((!message.trim() && !fileIds.length) || isAnalyzing || isUploading) return;
    onSendMessage(message, fileIds.length > 0 ? fileIds : null);
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isDisabled = isAnalyzing || isUploading || (!message.trim() && !fileIds.length);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 lg:px-6">
      <div className="flex flex-col gap-2 py-3 px-0 my-0 mx-0">
        {(currentFiles && currentFiles.length > 0) && (
          <FileUploadWithTags
            onFileUpload={handleFileUploadWithTags}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            currentFiles={currentFiles}
            onReset={resetUpload}
            variant="chat"
            messageId={sessionId || undefined}
            className="mb-2"
          />
        )}

        <div className="flex items-center gap-2 w-full bg-white rounded-lg border shadow-sm hover:shadow-md hover:border-gray-300 p-3 transition-all duration-200">
          <button
            onClick={() => document.getElementById('chat-file-input')?.click()}
            className={`p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 ${
              currentFiles && currentFiles.length > 0 ? "text-green-600" : "text-gray-500"
            }`}
            disabled={isAnalyzing || isUploading}
            aria-label="Upload file"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {!currentFiles?.length && (
            <FileUploadWithTags
              onFileUpload={handleFileUploadWithTags}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              currentFiles={null}
              onReset={resetUpload}
              variant="chat"
              messageId={sessionId || undefined}
              className="hidden"
              maxFiles={1}
            />
          )}

          <textarea
            ref={textareaRef}
            className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-sm placeholder:text-gray-400 resize-none"
            placeholder={isAnalyzing ? "Assistant is thinking..." : "Ask me anything..."}
            rows={1}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAnalyzing || isUploading}
          />

          <button
            onClick={handleSubmit}
            className={`bg-green-600 hover:bg-green-700 transition-all duration-200 shadow-sm h-9 w-9 p-0 rounded-lg flex items-center justify-center ${
              isDisabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={isDisabled}
            aria-label="Send message"
          >
            {isAnalyzing || isUploading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Send className="h-5 w-5 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
