
import { useState, useRef, useEffect } from "react";
import { Paperclip, Send } from "lucide-react";
import { useFileUpload } from "@/hooks/useFileUpload";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { fetchTags } from "@/services/tagService";
import { FileUploadCard } from "./FileUploadCard";
import { Tag } from "@/types/tags";

interface ChatInputProps {
  onSendMessage: (message: string, fileIds?: string[] | null, tagNames?: string[] | null) => void;
  isAnalyzing: boolean;
  sessionId?: string | null;
  fileInfo?: {
    filename: string;
    file_size: number;
  } | null;
}

const MAX_TAG_LENGTH = 50;
const TAG_REGEX = /^[a-zA-Z0-9\s-_]+$/;

export function ChatInput({
  onSendMessage,
  isAnalyzing,
  sessionId,
  fileInfo
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [fileRoles, setFileRoles] = useState<Record<string, string>>({});
  const [fileTags, setFileTags] = useState<Record<string, Tag[]>>({});
  const [pendingTags, setPendingTags] = useState<string[]>([]);

  const {
    handleFileUpload,
    isUploading,
    fileIds: uploadedFileIds,
    error: uploadError
  } = useFileUpload();

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTags
  });

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setLocalFiles(prev => [...prev, ...files]);

      try {
        for (const file of files) {
          await handleFileUpload(file, sessionId);
        }
      } catch (error) {
        console.error("File upload error:", error);
        toast({
          title: "Upload Failed",
          description: error instanceof Error ? error.message : "Failed to upload file",
          variant: "destructive"
        });
      }
    }
  };

  const removeFile = (index: number) => {
    const file = localFiles[index];
    setLocalFiles(prev => prev.filter((_, i) => i !== index));
    setFileRoles(prev => {
      const { [file.name]: _, ...rest } = prev;
      return rest;
    });
    setFileTags(prev => {
      const { [file.name]: _, ...rest } = prev;
      return rest;
    });
  };

  const validateTag = (tagName: string): string | null => {
    const trimmedTag = tagName.trim();
    
    if (!trimmedTag) {
      return "Tag cannot be empty";
    }
    
    if (trimmedTag.length > MAX_TAG_LENGTH) {
      return `Tag must be ${MAX_TAG_LENGTH} characters or less`;
    }
    
    if (!TAG_REGEX.test(trimmedTag)) {
      return "Tag can only contain letters, numbers, spaces, hyphens, and underscores";
    }
    
    if (pendingTags.some(t => t.toLowerCase() === trimmedTag.toLowerCase())) {
      return "Tag already exists";
    }
    
    return null;
  };

  const handleSubmit = () => {
    if ((!message.trim() && !uploadedFileIds.length) || isAnalyzing || isUploading) return;
    
    const validTags = pendingTags
      .map(tag => tag.trim())
      .filter(tag => tag && !validateTag(tag));

    onSendMessage(
      message,
      uploadedFileIds.length > 0 ? uploadedFileIds : null,
      validTags.length > 0 ? validTags : null
    );
    
    setMessage("");
    setLocalFiles([]);
    setFileRoles({});
    setFileTags({});
    setPendingTags([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleRoleSelect = (fileName: string, role: string) => {
    setFileRoles(prev => ({
      ...prev,
      [fileName]: role
    }));
  };

  const handleTagInput = (fileName: string, tagName: string) => {
    const error = validateTag(tagName);
    if (error) {
      toast({
        title: "Invalid Tag",
        description: error,
        variant: "destructive"
      });
      return;
    }

    setPendingTags(prev => [...prev, tagName.trim()]);
  };

  const handleTagRemove = (fileName: string, tag: Tag) => {
    setPendingTags(prev => prev.filter(t => t !== tag.name));
  };

  const isDisabled = isAnalyzing || isUploading || (!message.trim() && !uploadedFileIds.length);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 lg:px-6">
      <div className="flex flex-col gap-2 py-3 px-0 my-0 mx-0">
        {(isUploading || localFiles.length > 0 || fileInfo) && (
          <div className="space-y-2">
            {localFiles.map((file) => (
              <FileUploadCard
                key={file.name}
                file={file}
                isUploading={isUploading}
                onRemove={() => removeFile(localFiles.indexOf(file))}
                onRoleSelect={(role) => handleRoleSelect(file.name, role)}
                selectedTags={fileTags[file.name] || []}
                selectedRole={fileRoles[file.name]}
                availableTags={tags}
                onTagInput={(tagName) => handleTagInput(file.name, tagName)}
                onTagRemove={(tag) => handleTagRemove(file.name, tag)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 w-full bg-white rounded-lg border shadow-sm hover:shadow-md hover:border-gray-300 p-3 transition-all duration-200">
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 ${
              localFiles.length > 0 ? "text-green-600" : "text-gray-500"
            }`}
            disabled={isAnalyzing || isUploading}
            aria-label="Upload file"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
            accept=".xlsx,.xls,.csv"
            multiple
          />

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
