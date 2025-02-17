
import { Loader } from "lucide-react";
import { cn } from "@/lib/utils";

export enum LoadingStage {
  Analyzing = "analyzing",
  Processing = "processing",
  Generating = "generating",
  InProgress = "in_progress"
}

// Type for percentage-based generating stage
type GeneratingStage = `${LoadingStage.Generating} (${number}%)`;
type LoadingStageType = LoadingStage | GeneratingStage;

interface MessageLoadingStateProps {
  stage?: LoadingStageType;
  className?: string;
}

const messages: Record<LoadingStage, string> = {
  [LoadingStage.Analyzing]: "Analyzing request...",
  [LoadingStage.Processing]: "Processing data...",
  [LoadingStage.Generating]: "Generating response...",
  [LoadingStage.InProgress]: "Processing..."
};

export function MessageLoadingState({ stage = LoadingStage.InProgress, className }: MessageLoadingStateProps) {
  // Handle percentage-based generating message
  const baseMessage = typeof stage === 'string' && stage.startsWith(`${LoadingStage.Generating} (`)
    ? `Generating response ${stage.split('(')[1].split(')')[0]}`
    : messages[stage as LoadingStage] || messages[LoadingStage.Processing];

  const shouldPulse = stage === LoadingStage.Generating || 
                     stage === LoadingStage.Processing || 
                     stage === LoadingStage.InProgress ||
                     (typeof stage === 'string' && stage.startsWith(`${LoadingStage.Generating} (`));

  return (
    <div className={cn(
      "relative flex items-center gap-3 py-3 pl-2 min-h-[40px] bg-slate-50 rounded-lg",
      shouldPulse && "animate-pulse",
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
            {baseMessage}
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
