
import React from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadNodeHeaderProps {
  label: string;
  isProcessing: boolean;
  isComplete: boolean;
  isError: boolean;
  realtimeEnabled: boolean;
  refetch: () => void;
}

const FileUploadNodeHeader: React.FC<FileUploadNodeHeaderProps> = ({
  label,
  isProcessing,
  isComplete,
  isError,
  realtimeEnabled,
  refetch
}) => {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className={cn(
          "p-1.5 rounded-md", 
          isProcessing ? "bg-blue-100" : 
          isComplete ? "bg-green-100" : 
          isError ? "bg-red-100" : "bg-blue-100"
        )}>
          <FileText className={cn(
            "h-4 w-4", 
            isProcessing ? "text-blue-600" : 
            isComplete ? "text-green-600" : 
            isError ? "text-red-600" : "text-blue-600"
          )} />
        </div>
        <h3 className="font-medium text-sm">{label || 'File Upload'}</h3>
      </div>
      
      <div className="flex items-center">
        {realtimeEnabled && (
          <div className="h-5 mr-1 bg-green-50 text-green-700 border border-green-200 text-[9px] py-0.5 px-1.5 rounded-md">
            live
          </div>
        )}
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            "h-6 w-6 p-0",
            isProcessing && "text-blue-500"
          )}
          onClick={refetch}
          disabled={isProcessing}
        >
          <RefreshCw className={cn(
            "h-3.5 w-3.5", 
            isProcessing ? "animate-spin" : ""
          )} />
        </Button>
      </div>
    </div>
  );
};

export default FileUploadNodeHeader;
