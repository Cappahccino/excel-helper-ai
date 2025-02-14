
import { useState, useRef, useEffect } from "react";
import { Paperclip, Send, FileSpreadsheet, X } from "lucide-react";
import { useFileUpload } from "@/hooks/useFileUpload";
import { toast } from "@/hooks/use-toast";

interface ChatInputProps {
  onSendMessage: (message: string, fileId?: string | null) => void;
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
  const {
    handleFileUpload,
    isUploading,
    fileId,
    error: uploadError
  } = useFileUpload();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        await handleFileUpload(e.target.files[0], sessionId);
      } catch (error) {
        console.error('File upload error:', error);
        toast({
          title: "Upload Failed",
          description: error instanceof Error ? error.message : "Failed to upload file",
          variant: "destructive"
        });
      }
    }
  };

  const handleSubmit = () => {
    if (!message.trim() && !fileId || isAnalyzing || isUploading) return;
    onSendMessage(message, fileId);
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isDisabled = isAnalyzing || isUploading || !message.trim() && !fileId;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return <div className="w-full max-w-7xl mx-auto px-4 lg:px-6">
      <div className="flex flex-col gap-2 py-[10px] px-0 my-0 mx-0">
        {(isUploading || fileInfo) && (
          <div className="flex items-center gap-2 p-2 bg-zinc-900 rounded-lg text-white px-[5px] my-0 py-[9px] mx-0">
            <FileSpreadsheet className="h-4 w-4 text-green-500" />
            {isUploading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                <span className="text-sm">Uploading file...</span>
              </div>
            ) : fileInfo && (
              <div className="flex items-center justify-between w-full">
                <span className="text-sm">{fileInfo.filename} ({formatFileSize(fileInfo.file_size)})</span>
              </div>
            )}
          </div>
        )}
        
        <div className="flex gap-2 items-center w-full bg-white rounded-lg border shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-300 p-2">
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors" 
            disabled={isAnalyzing || isUploading} 
            aria-label="Upload file"
          >
            <Paperclip className="w-4 h-4 text-gray-500" />
          </button>

          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileChange} 
            accept=".xlsx,.xls,.csv" 
          />

          <textarea 
            ref={textareaRef} 
            className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-sm placeholder:text-gray-400 resize-none" 
            placeholder={isAnalyzing ? "Assistant is thinking..." : "Ask me anything..."} 
            rows={1} 
            value={message} 
            onChange={e => setMessage(e.target.value)} 
            onKeyDown={handleKeyDown} 
            disabled={isAnalyzing || isUploading} 
          />

          <button 
            onClick={handleSubmit} 
            className={`bg-excel hover:bg-excel/90 transition-colors duration-200 shadow-sm h-8 w-8 p-0 rounded-lg flex items-center justify-center ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`} 
            disabled={isDisabled} 
            aria-label="Send message"
          >
            {isAnalyzing || isUploading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Send className="h-4 w-4 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>;
}
