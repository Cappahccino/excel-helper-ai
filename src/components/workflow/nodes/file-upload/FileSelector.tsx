
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
import { useStableDropdown } from '@/hooks/useStableDropdown';

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
  const {
    open,
    setOpen,
    triggerRef,
    contentRef,
    preventSelection,
    stopPropagation
  } = useStableDropdown();

  return (
    <div onClick={preventSelection} className="transition-all duration-300">
      <Label htmlFor="fileSelect" className="text-xs font-medium text-gray-700">
        Select File
      </Label>
      
      {isLoadingFiles ? (
        <Skeleton className="h-9 w-full mt-1 rounded-md animate-pulse" />
      ) : (
        <Select 
          open={open}
          onOpenChange={setOpen}
          value={selectedFileId} 
          onValueChange={(value) => {
            onFileSelect(value);
            setOpen(false);
          }}
          disabled={disabled}
        >
          <SelectTrigger 
            id="fileSelect" 
            className="mt-1 relative z-50 bg-white transition-all duration-200 border-gray-200 hover:border-gray-300 focus:ring-1 focus:ring-blue-200"
            ref={triggerRef}
            onClick={stopPropagation}
          >
            <SelectValue placeholder="Choose a file..." />
          </SelectTrigger>
          <SelectContent
            ref={contentRef}
            className="z-[9999] bg-white shadow-lg border border-gray-200 animate-fade-in"
            position="popper"
            sideOffset={5}
            onClick={stopPropagation}
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
                  className="cursor-pointer transition-colors hover:bg-blue-50 focus:bg-blue-50"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
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
