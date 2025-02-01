import { ChatMessage } from "@/types/chat";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isAnalyzing: boolean;
}

export function ChatMessages({ messages, isLoading, isAnalyzing }: ChatMessagesProps) {
  return (
    <div className="space-y-4">
      {messages?.map((message) => (
        <div
          key={message.id}
          className={`p-4 rounded-lg ${
            message.is_ai_response
              ? "bg-blue-50 ml-4"
              : "bg-gray-50 mr-4"
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      ))}

      {isLoading && (
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
        </div>
      )}

      {isAnalyzing && (
        <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg ml-4">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-excel"></div>
          <p className="text-sm">Analyzing your Excel file...</p>
        </div>
      )}
    </div>
  );
}