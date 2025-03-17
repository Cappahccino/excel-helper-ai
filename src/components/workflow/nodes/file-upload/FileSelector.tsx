
import React, { useMemo, useCallback } from 'react';
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

  // Handle file selection with explicit stop propagation
  const handleFileSelect = useCallback((fileId: string) => {
    onFileSelect(fileId);
  }, [onFileSelect]);

  // Handle dropdown click to prevent event propagation to React Flow canvas
  const handleDropdownClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

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
          onValueChange={handleFileSelect}
          disabled={disabled}
        >
          <SelectTrigger id="fileSelect" className="mt-1" onClick={handleDropdownClick}>
            <SelectValue placeholder="Choose a file..." />
          </SelectTrigger>
          <SelectContent 
            className="w-full max-h-[300px] overflow-y-auto bg-white border border-gray-200 shadow-lg" 
            position="popper"
            sideOffset={5}
            align="start"
            avoidCollisions={true}
            sticky="always"
            style={{ zIndex: 9999 }} // Force higher z-index
            onCloseAutoFocus={(e) => {
              // Prevent automatic focus return which can cause issues with React Flow
              e.preventDefault();
            }}
            onEscapeKeyDown={(e) => {
              // Stop propagation to prevent React Flow from handling the escape key
              e.stopPropagation();
            }}
            onPointerDownOutside={(e) => {
              // Only close if clicking outside the dropdown and file selector node
              const target = e.target as Node;
              const selectContent = document.querySelector('[data-radix-select-content]');
              const fileUploadNode = document.querySelector('.react-flow__node');
              
              // If clicking inside the dropdown content or the file upload node, prevent closing
              if (selectContent?.contains(target) || fileUploadNode?.contains(target)) {
                e.preventDefault();
              }
            }}
          >
            {sortedFiles?.length === 0 ? (
              <div className="py-6 px-2 text-center">
                <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No files found</p>
              </div>
            ) : (
              sortedFiles?.map((file) => (
                <SelectItem 
                  key={file.id} 
                  value={file.id}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
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
      
      {selectedFile && (
        <div className="mt-1 text-xs text-gray-500">
          <span>{new Date(selectedFile.created_at).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
};

export default FileSelector;
