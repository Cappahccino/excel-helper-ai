import { ProcessingStatus as Status } from "@/hooks/useProcessingStatus";
import { Loader2 } from "lucide-react";

interface ProcessingStatusProps {
  status: Status;
  error?: string;
}

export function ProcessingStatus({ status, error }: ProcessingStatusProps) {
  const getStatusMessage = () => {
    switch (status) {
      case "uploading":
        return "Uploading file...";
      case "processing":
        return "Processing Excel file...";
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

  return (
    <div className={`flex items-center gap-2 p-4 rounded-lg ${
      status === "error" ? "bg-red-50 text-red-700" :
      status === "completed" ? "bg-green-50 text-green-700" :
      "bg-blue-50 text-blue-700"
    }`}>
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      <p className="text-sm">{getStatusMessage()}</p>
    </div>
  );
}