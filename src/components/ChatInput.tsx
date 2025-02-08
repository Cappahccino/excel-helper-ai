
import { useState, useRef, useEffect } from "react";
import { Paperclip, Send } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (message: string, file?: File) => void;
  isAnalyzing: boolean;
}

export function ChatInput({ onSendMessage, isAnalyzing }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const sendMessage = () => {
    if (message.trim() === "" && !file) return;
    onSendMessage(message, file);
    setMessage("");
    setFile(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pb-4">
      <div className="flex gap-2 items-center w-full bg-white rounded-lg border shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-300 p-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          disabled={isAnalyzing}
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

        {file && (
          <div className="text-sm bg-gray-50 px-3 py-1 rounded-lg text-gray-700 flex items-center gap-2">
            <span className="truncate max-w-[200px]">{file.name}</span>
            <button
              onClick={() => setFile(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-sm placeholder:text-gray-400 resize-none"
          placeholder="Ask me anything..."
          rows={1}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isAnalyzing}
        />

        <button 
          onClick={sendMessage}
          className="bg-excel hover:bg-excel/90 transition-colors duration-200 shadow-sm h-8 w-8 p-0 rounded-lg flex items-center justify-center"
          disabled={(!message.trim() && !file) || isAnalyzing}
        >
          {isAnalyzing ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          ) : (
            <Send className="h-4 w-4 text-white" />
          )}
        </button>
      </div>
    </div>
  );
}
