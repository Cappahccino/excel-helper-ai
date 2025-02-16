
import { Button } from "../ui/button";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MessageActionsProps {
  content: string;
  timestamp: string;
}

export function MessageActions({ content, timestamp }: MessageActionsProps) {
  const { toast } = useToast();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content).then(() => {
      toast({
        description: "Message copied to clipboard",
      });
    });
  };

  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-xs text-gray-500">{timestamp}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        onClick={copyToClipboard}
        title="Copy message"
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}
