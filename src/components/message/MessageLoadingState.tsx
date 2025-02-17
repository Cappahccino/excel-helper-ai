
import { Loader } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageLoadingStateProps {
  stage?: 'analyzing' | 'processing' | 'generating';
  className?: string;
}

export function MessageLoadingState({ stage = 'generating', className }: MessageLoadingStateProps) {
  const messages = {
    analyzing: "Analyzing request...",
    processing: "Processing data...",
    generating: "Generating response..."
  };

  return (
    <div className={cn(
      "relative flex items-center gap-3 py-3 pl-2 min-h-[40px] bg-slate-50 rounded-lg animate-pulse",
      className
    )}>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Loader className="w-4 h-4 text-blue-500 animate-spin" />
          <div className="absolute inset-0 w-4 h-4 animate-ping opacity-50">
            <div className="w-full h-full rounded-full bg-blue-500/20" />
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-slate-700">
            {messages[stage]}
          </span>
          <div className="flex space-x-1 mt-1">
            <span className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce"></span>
          </div>
        </div>
      </div>
    </div>
  );
}
