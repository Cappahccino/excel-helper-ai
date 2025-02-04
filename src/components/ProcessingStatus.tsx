import { Loader2 } from "lucide-react";

interface ProcessingStatusProps {
  status: string | undefined;
  errorMessage?: string | null;
}

export const ProcessingStatus = ({ status, errorMessage }: ProcessingStatusProps) => {
  if (!status) return null;

  switch (status) {
    case 'processing':
      return (
        <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <p className="text-sm text-blue-700">Processing your Excel file...</p>
        </div>
      );
    case 'error':
      return (
        <div className="p-4 bg-red-50 rounded-lg">
          <p className="text-sm text-red-700">
            {errorMessage || "An error occurred while processing your file."}
          </p>
        </div>
      );
    default:
      return null;
  }
};