
import React, { useMemo, useCallback, useRef, useEffect } from 'react';
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
  // Track whether dropdown is open
  const [isOpen, setIsOpen] = React.useState(false);
  const selectContentRef = useRef<HTMLDivElement>(null);

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

  // Enhanced dropdown click handler with more aggressive event stopping
  const handleDropdownClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent any default behavior
  }, []);

  // Stop propagation on the whole component
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Focus management when dropdown opens
  useEffect(() => {
    if (isOpen && selectContentRef.current) {
      // Ensure dropdown container maintains focus
      selectContentRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div 
      onClick={handleContainerClick} 
      className="file-selector-container"
    >
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
          onOpenChange={setIsOpen}
        >
          <SelectTrigger 
            id="fileSelect" 
            className="mt-1" 
            onClick={handleDropdownClick}
            onMouseDown={(e) => e.stopPropagation()}
          >
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
            onInteractOutside={(e) => {
              // Prevent interaction outside from closing the dropdown when clicking on the node
              const target = e.target as Node;
              const fileUploadNode = document.querySelector('.react-flow__node');
              
              if (fileUploadNode?.contains(target)) {
                e.preventDefault();
              }
            }}
            ref={selectContentRef}
            onKeyDown={(e) => {
              // Prevent key events from propagating to React Flow
              e.stopPropagation();
            }}
          >
            {sortedFiles?.length === 0 ? (
              <div 
                className="py-6 px-2 text-center" 
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
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
                  onMouseDown={(e) => e.stopPropagation()}
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
