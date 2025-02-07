
import { Copy } from "lucide-react";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { FileInfo } from "./FileInfo";

interface MessageContentProps {
  content: string;
  role: 'assistant' | 'user';
  timestamp: string;
  fileInfo?: {
    filename: string;
    file_size: number;
  } | null;
}

export function MessageContent({ content, role, timestamp, fileInfo }: MessageContentProps) {
  const { toast } = useToast();
  const isAssistant = role === 'assistant';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "Copied to clipboard",
        description: "Message content has been copied to your clipboard.",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy the message to clipboard.",
        variant: "destructive",
      });
    }
  };

  const getInitials = () => {
    return isAssistant ? "AI" : "U";
  };

  return (
    <div
      className={`flex gap-4 ${
        isAssistant ? "flex-row" : "flex-row-reverse"
      } items-start`}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={isAssistant ? "bg-blue-100" : "bg-zinc-100"}>
          {getInitials()}
        </AvatarFallback>
      </Avatar>

      <div className={`flex flex-col gap-2 ${isAssistant ? "items-start" : "items-end"} flex-1`}>
        <div
          className={`rounded-lg p-4 max-w-[80%] ${
            isAssistant ? "bg-blue-50" : "bg-gray-50"
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{content}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">{timestamp}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {fileInfo && (
          <div className="max-w-[80%] mt-2">
            <FileInfo
              filename={fileInfo.filename}
              fileSize={fileInfo.file_size}
            />
          </div>
        )}
      </div>
    </div>
  );
}
