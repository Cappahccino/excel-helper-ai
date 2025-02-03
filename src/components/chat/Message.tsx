import { cn } from "@/lib/utils";

interface MessageProps {
  content: string;
  isAiResponse: boolean;
  status: 'sent' | 'pending' | 'error';
}

export function Message({ content, isAiResponse, status }: MessageProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-lg",
        isAiResponse ? "bg-blue-50 ml-4" : "bg-gray-50 mr-4",
        status === 'error' && "border-red-300 border"
      )}
    >
      <p className="text-sm whitespace-pre-wrap">{content}</p>
      {status === 'pending' && (
        <div className="flex items-center gap-2 mt-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-excel"></div>
          <p className="text-sm text-gray-500">Processing...</p>
        </div>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-500 mt-2">Failed to send message</p>
      )}
    </div>
  );
}