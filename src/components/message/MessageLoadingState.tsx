
import { Spinner } from "../ui/spinner";

interface MessageLoadingStateProps {
  displayState: 'thinking' | 'streaming' | 'complete';
}

export function MessageLoadingState({ displayState }: MessageLoadingStateProps) {
  if (displayState === "thinking") {
    return (
      <div className="flex items-center gap-2 mt-2">
        <Spinner variant="ring" className="h-4 w-4 text-excel" />
        <span className="text-sm text-gray-500">Assistant is thinking...</span>
      </div>
    );
  }
  if (displayState === "streaming") {
    return (
      <span className="inline-block h-4 w-[2px] bg-excel animate-blink ml-1" />
    );
  }
  return null;
}
