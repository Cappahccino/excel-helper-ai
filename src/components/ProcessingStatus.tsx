
import { ProcessingStatus as Status } from "@/hooks/useProcessingStatus";
import { Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessingStatusProps {
  status: Status;
  error?: string;
  retryCount?: number;
  maxRetries?: number;
}

export function ProcessingStatus({ status, error, retryCount = 0, maxRetries = 3 }: ProcessingStatusProps) {
  const getStatusMessage = () => {
    switch (status) {
      case "uploading":
        return "Uploading file...";
      case "processing":
        return `Processing Excel file... (Attempt ${retryCount}/${maxRetries})`;
      case "analyzing":
        return "Analyzing data...";
      case "completed":
        return "Processing complete";
      case "error":
        return error || "An error occurred";
      default:
        return "Preparing file...";
    }
  };

  const isLoading = ["pending", "uploading", "processing", "analyzing"].includes(status);
  const hasError = status === "error";
  const isComplete = status === "completed";

  return (
    <div className={cn(
      "flex items-center gap-2 p-4 rounded-lg",
      hasError && "bg-red-50 text-red-700",
      isComplete && "bg-green-50 text-green-700",
      isLoading && "bg-blue-50 text-blue-700"
    )}>
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {hasError && <AlertCircle className="h-4 w-4" />}
      {isComplete && <CheckCircle2 className="h-4 w-4" />}
      {!isLoading && !hasError && !isComplete && <Clock className="h-4 w-4" />}
      <p className="text-sm font-medium">{getStatusMessage()}</p>
    </div>
  );
}
