
import { Button } from "../ui/button";
import { RotateCw } from "lucide-react";

interface ChatErrorProps {
  onRetry: () => void;
}

export function ChatError({ onRetry }: ChatErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      <p className="text-red-600 mb-4">Failed to load messages</p>
      <Button onClick={onRetry} variant="outline" className="gap-2">
        <RotateCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
