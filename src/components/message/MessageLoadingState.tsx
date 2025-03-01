
import { Loader, AlertCircle, FileWarning, Wifi, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIServiceErrorType } from "@/services/aiService";

export enum LoadingStage {
  Analyzing = "analyzing",
  Processing = "processing",
  Generating = "generating",
  InProgress = "in_progress",
  UploadingFiles = "uploading_files",
  VerifyingFiles = "verifying_files", // New stage for file verification
  Failed = "failed" // New stage for failures
}

// Type for percentage-based generating stage
type GeneratingStage = `${LoadingStage.Generating} (${number}%)`;
type LoadingStageType = LoadingStage | GeneratingStage;

interface MessageLoadingStateProps {
  stage?: LoadingStageType;
  className?: string;
  fileCount?: number;
  errorType?: AIServiceErrorType;
  errorMessage?: string;
}

const messages: Record<LoadingStage, string> = {
  [LoadingStage.Analyzing]: "Analyzing request...",
  [LoadingStage.Processing]: "Processing data...",
  [LoadingStage.Generating]: "Generating response...",
  [LoadingStage.InProgress]: "Processing...",
  [LoadingStage.UploadingFiles]: "Uploading files...", // Message for file upload stage
  [LoadingStage.VerifyingFiles]: "Verifying files...", // Message for file verification
  [LoadingStage.Failed]: "Processing failed" // Message for failures
};

export function MessageLoadingState({ 
  stage = LoadingStage.Processing, 
  className,
  fileCount = 0,
  errorType,
  errorMessage
}: MessageLoadingStateProps) {
  // Handle percentage-based generating message
  const isGeneratingWithPercent = typeof stage === 'string' && stage.startsWith(`${LoadingStage.Generating} (`);
  const isFailed = stage === LoadingStage.Failed;
  
  // Create the base message with additional context if needed
  let baseMessage = '';
  
  if (isGeneratingWithPercent) {
    baseMessage = `Generating response ${stage.split('(')[1].split(')')[0]}`;
  } else if (stage === LoadingStage.UploadingFiles && fileCount > 0) {
    baseMessage = `Uploading ${fileCount} file${fileCount > 1 ? 's' : ''}...`;
  } else if (stage === LoadingStage.VerifyingFiles && fileCount > 0) {
    baseMessage = `Verifying ${fileCount} file${fileCount > 1 ? 's' : ''}...`;
  } else if (isFailed && errorMessage) {
    baseMessage = errorMessage;
  } else {
    baseMessage = messages[stage as LoadingStage] || messages[LoadingStage.Processing];
  }

  const shouldPulse = stage === LoadingStage.Generating || 
                     stage === LoadingStage.Processing || 
                     stage === LoadingStage.InProgress ||
                     stage === LoadingStage.UploadingFiles ||
                     stage === LoadingStage.VerifyingFiles ||
                     isGeneratingWithPercent;
  
  // Select icon based on state
  const getIcon = () => {
    if (isFailed) {
      if (errorType === AIServiceErrorType.VERIFICATION_FAILED) {
        return <FileWarning className="w-4 h-4 text-red-500" />;
      } else if (errorType === AIServiceErrorType.NETWORK_ERROR) {
        return <Wifi className="w-4 h-4 text-red-500" />;
      } else {
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      }
    } else if (stage === LoadingStage.VerifyingFiles) {
      return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
    } else {
      return <Loader className="w-4 h-4 text-blue-500 animate-spin" />;
    }
  };

  return (
    <div className={cn(
      "relative flex items-center gap-3 py-3 pl-2 min-h-[40px] rounded-lg",
      isFailed ? "bg-red-50" : "bg-slate-50",
      shouldPulse && "animate-pulse",
      className
    )}>
      <div className="flex items-center gap-3">
        <div className="relative">
          {getIcon()}
          {!isFailed && (
            <div className="absolute inset-0 w-4 h-4 animate-ping opacity-50">
              <div className="w-full h-full rounded-full bg-blue-500/20" />
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <span className={cn(
            "text-sm font-medium",
            isFailed ? "text-red-700" : "text-slate-700"
          )}>
            {baseMessage}
          </span>
          {!isFailed && (
            <div className="flex space-x-1 mt-1">
              <span className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce"></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
