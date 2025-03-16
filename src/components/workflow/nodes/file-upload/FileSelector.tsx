
import React from 'react';
import { FileText, AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FileSelectorProps {
  selectedFileId?: string;
  files: any[];
  isLoadingFiles: boolean;
  onFileSelect: (fileId: string) => void;
  disabled: boolean;
}

const FileSelector: React.FC<FileSelectorProps> = ({
  selectedFileId,
  files,
  isLoadingFiles,
  onFileSelect,
  disabled
}) => {
  // Handle file selection with a dedicated handler to prevent event bubbling
  const handleValueChange = (value: string) => {
    // Ensure we're not propagating events to parent elements
    onFileSelect(value);
  };
  
  // Stop propagation on dropdown interaction to prevent React Flow from capturing events
  const handleInteraction = (e: React.MouseEvent) => {
    e.stopPropagation();
  };
  
  return (
    <div className="relative z-30" onMouseDown={handleInteraction}>
      <Label htmlFor="fileSelect" className="text-xs font-medium">
        Select File
      </Label>
      
      {isLoadingFiles ? (
        <Skeleton className="h-9 w-full mt-1" />
      ) : (
        <Select 
          value={selectedFileId} 
          onValueChange={handleValueChange}
          disabled={disabled}
        >
          <SelectTrigger 
            id="fileSelect" 
            className="mt-1"
            onMouseDown={handleInteraction}
            onClick={handleInteraction}
          >
            <SelectValue placeholder="Choose a file..." />
          </SelectTrigger>
          <SelectContent
            className="z-[9999] bg-white"
            position="popper"
            sideOffset={5}
            align="start"
            onMouseDown={handleInteraction}
            onClick={handleInteraction}
            onPointerDownOutside={(e) => {
              // This prevents the dropdown from closing when clicking inside the dropdown
              e.preventDefault();
            }}
          >
            {files?.length === 0 ? (
              <div className="py-6 px-2 text-center">
                <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No files found</p>
              </div>
            ) : (
              files?.map((file) => (
                <SelectItem 
                  key={file.id} 
                  value={file.id}
                  className="focus:bg-gray-100 focus:text-gray-900 cursor-pointer"
                  onMouseDown={handleInteraction}
                  onClick={handleInteraction}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate max-w-[180px]">{file.filename}</span>
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};

export default FileSelector;
