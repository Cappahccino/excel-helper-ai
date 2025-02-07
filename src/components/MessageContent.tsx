
import { Copy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { useToast } from "@/hooks/use-toast";

interface MessageContentProps {
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  fileInfo?: {
    filename: string;
    file_size: number;
  };
}

export function MessageContent({ content, role, timestamp, fileInfo }: MessageContentProps) {
  const { toast } = useToast();
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(content).then(() => {
      toast({
        description: "Message copied to clipboard",
      });
    });
  };

  const getInitials = () => {
    return role === 'assistant' ? 'AI' : 'U';
  };

  const messageClassName = `p-4 rounded-lg flex ${
    role === 'assistant'
      ? 'bg-blue-50 ml-4 items-start'
      : 'bg-gray-50 mr-4 flex-row-reverse items-start'
  }`;

  return (
    <div className={messageClassName}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback>{getInitials()}</AvatarFallback>
      </Avatar>
      <div className={`flex flex-col gap-1 mx-2 ${role === 'assistant' ? 'ml-2' : 'mr-2'}`}>
        <p className="text-sm whitespace-pre-wrap">{content}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500">{timestamp}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={copyToClipboard}
            title="Copy message"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
