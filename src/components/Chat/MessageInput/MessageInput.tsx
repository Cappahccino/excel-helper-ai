import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { debounce } from "lodash";
import { useCallback } from "react";

interface MessageInputProps {
  message: string;
  onMessageChange: (message: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled?: boolean;
}

export function MessageInput({ 
  message, 
  onMessageChange, 
  onSubmit,
  disabled 
}: MessageInputProps) {
  const debouncedSetMessage = useCallback(
    debounce((value: string) => {
      onMessageChange(value);
    }, 300),
    [onMessageChange]
  );

  return (
    <form onSubmit={onSubmit} className="border-t p-4">
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={message}
          onChange={(e) => debouncedSetMessage(e.target.value)}
          placeholder="Ask about your Excel file..."
          className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Message input"
        />
        <Button 
          type="submit" 
          className="bg-excel hover:bg-excel/90"
          aria-label="Send message"
          disabled={disabled}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}