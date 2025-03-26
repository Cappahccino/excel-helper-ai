import { useState, useRef, useEffect } from "react";
import { Paperclip, Send, Command } from "lucide-react";
import { useFileUpload } from "@/hooks/useFileUpload";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { fetchTags } from "@/services/tagService";
import { FileUploadCard } from "./FileUploadCard";
import { Tag } from "@/types/tags";

interface ChatInputProps {
  onSendMessage: (message: string, fileIds?: string[] | null, tagNames?: string[] | null) => void;
  isAnalyzing: boolean;
  processingStage?: {
    stage: string;
    completion_percentage?: number;
  };
  sessionId?: string | null;
  fileInfo?: {
    filename: string;
    file_size: number;
    fileMetadata?: any;
  } | null;
}

// Command suggestions interface
interface CommandSuggestion {
  command: string;
  description: string;
  icon: React.ReactNode;
}

const MAX_TAG_LENGTH = 50;
// Fixed regex: Using a different approach with character literals, no character ranges
const TAG_REGEX = /^[a-zA-Z0-9\s_\-]+$/;

export function ChatInput({
  onSendMessage,
  isAnalyzing,
  processingStage,
  sessionId,
  fileInfo
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [fileRoles, setFileRoles] = useState<Record<string, string>>({});
  const [fileTags, setFileTags] = useState<Record<string, Tag[]>>({});
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);

  const {
    handleFileUpload,
    isUploading,
    fileIds,
    error: uploadError
  } = useFileUpload();

  const { data: availableTags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTags
  });

  // Command suggestions based on context
  const commandSuggestions: CommandSuggestion[] = [
    {
      command: "/summary",
      description: "Generate a summary of the data",
      icon: <span className="text-blue-500">📊</span>
    },
    {
      command: "/chart",
      description: "Create a visualization",
      icon: <span className="text-green-500">📈</span>
    },
    {
      command: "/filter",
      description: "Filter the dataset",
      icon: <span className="text-purple-500">🔍</span>
    },
    {
      command: "/compare",
      description: "Compare data points",
      icon: <span className="text-orange-500">⚖️</span>
    },
    {
      command: "/explain",
      description: "Explain Excel formulas or concepts",
      icon: <span className="text-teal-500">❓</span>
    }
  ];

  // Populate column names from fileInfo if available
  useEffect(() => {
    if (fileInfo?.fileMetadata?.column_definitions) {
      setAvailableColumns(Object.keys(fileInfo.fileMetadata.column_definitions));
    }
  }, [fileInfo]);

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
        await handleFileUpload(files);
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

  const validateTag = (fileName: string, tagName: string): string | null => {
    const trimmedTag = tagName.trim();
    
    if (!trimmedTag) {
      return "Tag cannot be empty";
    }
    
    // Check if it's an existing tag
    const isExistingTag = availableTags.some(tag => 
      tag.name.toLowerCase() === trimmedTag.toLowerCase()
    );

    // Only validate format for new tags
    if (!isExistingTag) {
      if (trimmedTag.length > MAX_TAG_LENGTH) {
        return `Tag must be ${MAX_TAG_LENGTH} characters or less`;
      }
      
      if (!TAG_REGEX.test(trimmedTag)) {
        return "Tag can only contain letters, numbers, spaces, hyphens, and underscores";
      }
    }
    
    // Check for duplicates only within the same file
    const fileCurrentTags = fileTags[fileName] || [];
    if (fileCurrentTags.some(tag => tag.name.toLowerCase() === trimmedTag.toLowerCase())) {
      return "This file already has this tag";
    }
    
    return null;
  };

  // Handle command selection
  const handleCommandSelect = (command: string) => {
    setMessage(command + " ");
    setSelectedCommand(command);
    setShowCommands(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSubmit = () => {
    if ((!message.trim() && !fileIds.length) || isAnalyzing || isUploading) return;
    
    // Collect all tags from all files
    const allTags = Object.values(fileTags).flat();
    const tagNames = allTags.map(tag => tag.name);

    onSendMessage(
      message,
      fileIds.length > 0 ? fileIds : null,
      tagNames.length > 0 ? tagNames : null
    );
    
    setMessage("");
    setSelectedCommand(null);
    setLocalFiles([]);
    setFileRoles({});
    setFileTags({});
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "/" && message === "") {
      e.preventDefault();
      setShowCommands(true);
    } else if (e.key === "Escape") {
      setShowCommands(false);
      setSelectedCommand(null);
    } else if (e.key === "Backspace" && selectedCommand && message.trim() === selectedCommand) {
      setSelectedCommand(null);
    }
  };

  const handleRoleSelect = (fileName: string, role: string) => {
    setFileRoles(prev => ({
      ...prev,
      [fileName]: role
    }));
  };

  const handleTagInput = (fileName: string, tagName: string) => {
    const error = validateTag(fileName, tagName);
    if (error) {
      toast({
        title: "Invalid Tag",
        description: error,
        variant: "destructive"
      });
      return;
    }

    const trimmedTagName = tagName.trim();
    
    // Find existing tag or create a new one
    let tagToAdd: Tag;
    const existingTag = availableTags.find(
      tag => tag.name.toLowerCase() === trimmedTagName.toLowerCase()
    );

    if (existingTag) {
      tagToAdd = existingTag;
    } else {
      // Create a new tag object
      tagToAdd = {
        id: `temp-${Date.now()}`,
        name: trimmedTagName,
        type: 'custom',
        category: null,
        created_at: new Date().toISOString(),
        is_system: false,
        metadata: {
          usage_stats: {
            total_uses: 0,
            last_used: null,
            file_count: 0
          }
        }
      };
    }

    // Update fileTags state
    setFileTags(prev => ({
      ...prev,
      [fileName]: [...(prev[fileName] || []), tagToAdd]
    }));
  };

  const handleTagRemove = (fileName: string, tagToRemove: Tag) => {
    setFileTags(prev => ({
      ...prev,
      [fileName]: (prev[fileName] || []).filter(tag => tag.id !== tagToRemove.id)
    }));
  };

  const isDisabled = isAnalyzing || isUploading || (!message.trim() && !fileIds.length);

  // Get processing stage description
  const getProcessingDescription = () => {
    if (!processingStage) return "thinking...";
    
    switch (processingStage.stage) {
      case 'uploading_files': return "uploading files...";
      case 'analyzing': return "analyzing data...";
      case 'processing': return "processing data...";
      case 'generating': return "generating response...";
      default: return processingStage.stage + "...";
    }
  };

  // Function to render message with highlighted command
  const renderMessageWithHighlight = () => {
    if (!selectedCommand) return message;
    
    const parts = message.split(selectedCommand);
    if (parts.length < 2) return message;
    
    return (
      <>
        <span className="text-green-500 font-medium">{selectedCommand}</span>
        {parts[1]}
      </>
    );
  };

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
                availableTags={availableTags}
                onTagInput={(tagName) => handleTagInput(file.name, tagName)}
                onTagRemove={(tag) => handleTagRemove(file.name, tag)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 w-full bg-white rounded-lg border shadow-sm hover:shadow-md hover:border-gray-300 p-3 transition-all duration-200">
          {/* Command button */}
          <button
            onClick={() => setShowCommands(!showCommands)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            aria-label="Show commands"
          >
            <Command className="w-5 h-5" />
          </button>
          
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

          <div className="relative flex-1">
            <div
              className="w-full min-w-0 bg-transparent text-sm placeholder:text-gray-400"
              style={{ minHeight: '24px' }}
            >
              {selectedCommand ? (
                <div className="whitespace-pre-wrap break-words">
                  {renderMessageWithHighlight()}
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  className="w-full min-w-0 bg-transparent border-none focus:outline-none text-sm placeholder:text-gray-400 resize-none"
                  placeholder={isAnalyzing ? `Assistant is ${getProcessingDescription()}` : "Ask me anything about your Excel data..."}
                  rows={1}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isAnalyzing || isUploading}
                />
              )}
            </div>
            
            {/* Command suggestions dropdown */}
            {showCommands && (
              <div className="absolute bottom-full left-0 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-60 overflow-y-auto z-10">
                {commandSuggestions.map((cmd) => (
                  <div
                    key={cmd.command}
                    className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleCommandSelect(cmd.command)}
                  >
                    <div className="text-gray-500">{cmd.icon}</div>
                    <div className="flex-1">
                      <div className="font-medium">{cmd.command}</div>
                      <div className="text-xs text-gray-500">{cmd.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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
        
        {/* Processing status indicator */}
        {isAnalyzing && processingStage && (
          <div className="mt-2 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-green-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${processingStage.completion_percentage || 0}%` }}
                ></div>
              </div>
              <span className="whitespace-nowrap">
                {getProcessingDescription()}
                {processingStage.completion_percentage ? ` (${processingStage.completion_percentage}%)` : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}