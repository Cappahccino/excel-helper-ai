import { useState, useRef, useEffect } from "react";
import { Paperclip, Send, FileSpreadsheet, X } from "lucide-react";
import { useFileUpload } from "@/hooks/useFileUpload";
import { toast } from "@/hooks/use-toast";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const {
    handleFileUpload,
    isUploading,
    fileIds: uploadedFileIds,
    error: uploadError
  } = useFileUpload();

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
    setLocalFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if ((!message.trim() && !uploadedFileIds.length) || isAnalyzing || isUploading) return;
    onSendMessage(message, uploadedFileIds.length > 0 ? uploadedFileIds : null);
    setMessage("");
    setLocalFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isDisabled = isAnalyzing || isUploading || (!message.trim() && !uploadedFileIds.length);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 lg:px-6">
      <div className="flex flex-col gap-2 py-3 px-0 my-0 mx-0">
        {(isUploading || localFiles.length > 0 || fileInfo) && (
          <div className="space-y-2">
            {localFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-100 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  {isUploading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-600" />
                      <span className="text-sm text-gray-700">Uploading file...</span>
                    </div>
                  ) : (
                    <span className="text-sm font-medium text-gray-700">
                      {file.name} ({formatFileSize(file.size)})
                    </span>
                  )}
                </div>
                
                <button
                  onClick={() => removeFile(index)}
                  className="p-1.5 rounded-full hover:bg-gray-200 transition-colors"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>
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
