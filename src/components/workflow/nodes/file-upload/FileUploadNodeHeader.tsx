
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
    <div className="flex items-center justify-between mb-3 animate-fade-in">
      <div className="flex items-center gap-2 group">
        <div className={cn(
          "p-1.5 rounded-md transition-colors duration-300", 
          isProcessing ? "bg-blue-100 group-hover:bg-blue-200" : 
          isComplete ? "bg-green-100 group-hover:bg-green-200" : 
          isError ? "bg-red-100 group-hover:bg-red-200" : "bg-blue-100 group-hover:bg-blue-200"
        )}>
          <FileText className={cn(
            "h-4 w-4 transition-transform duration-200 group-hover:scale-110", 
            isProcessing ? "text-blue-600" : 
            isComplete ? "text-green-600" : 
            isError ? "text-red-600" : "text-blue-600"
          )} />
        </div>
        <h3 className="font-medium text-sm transition-colors duration-300">{label || 'File Upload'}</h3>
      </div>
      
      <div className="flex items-center gap-1">
        {realtimeEnabled && (
          <div className="h-5 px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 text-[9px] rounded-md transition-all duration-300 animate-fade-in hover:bg-green-100">
            live
          </div>
        )}
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            "h-6 w-6 p-0 transition-all duration-300",
            isProcessing ? "text-blue-500" : "hover:text-blue-600 hover:bg-blue-50"
          )}
          onClick={refetch}
          disabled={isProcessing}
        >
          <RefreshCw className={cn(
            "h-3.5 w-3.5 transition-all duration-300", 
            isProcessing ? "animate-spin" : "group-hover:rotate-180"
          )} />
        </Button>
      </div>
    </div>
  );
};

export default FileUploadNodeHeader;
