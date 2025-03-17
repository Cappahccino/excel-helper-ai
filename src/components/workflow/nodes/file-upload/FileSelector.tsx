
import React, { useMemo } from 'react';
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
import { ExcelFile } from '@/types/files';

interface FileSelectorProps {
  selectedFileId?: string;
  files: ExcelFile[];
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
  const sortedFiles = useMemo(() => {
    return [...(files || [])].sort((a, b) => {
      // Sort by most recently created first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [files]);

  const selectedFile = useMemo(() => {
    return files?.find(file => file.id === selectedFileId);
  }, [files, selectedFileId]);

  return (
    <div>
      <Label htmlFor="fileSelect" className="text-xs font-medium">
        Select File
      </Label>
      
      {isLoadingFiles ? (
        <Skeleton className="h-9 w-full mt-1" />
      ) : (
        <Select 
          value={selectedFileId} 
          onValueChange={onFileSelect}
          disabled={disabled}
        >
          <SelectTrigger id="fileSelect" className="mt-1">
            <SelectValue placeholder="Choose a file..." />
          </SelectTrigger>
          <SelectContent 
            className="w-full max-h-[300px] overflow-y-auto z-50 bg-white" 
            position="popper"
            sideOffset={5}
            align="start"
          >
            {sortedFiles?.length === 0 ? (
              <div className="py-6 px-2 text-center">
                <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No files found</p>
              </div>
            ) : (
              sortedFiles?.map((file) => (
                <SelectItem key={file.id} value={file.id}>
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
      
      {selectedFile && (
        <div className="mt-1 text-xs text-gray-500">
          <span>{new Date(selectedFile.created_at).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
};

export default FileSelector;
