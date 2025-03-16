
import React, { memo, useMemo } from 'react';
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

// Use memo with a custom comparison function to prevent unnecessary re-renders
const FileSelector = memo(({
  selectedFileId,
  files,
  isLoadingFiles,
  onFileSelect,
  disabled
}: FileSelectorProps) => {
  const {
    open,
    setOpen,
    triggerRef,
    contentRef,
    preventSelection,
    stopPropagation
  } = useStableDropdown({
    preventNodeSelection: true,
    debounceDelay: 100,
    closeOnOutsideClick: true
  });

  // Memoize files for stability
  const memoizedFiles = useMemo(() => files || [], [files]);

  // Create a stable handler for file selection
  const handleSelectFile = React.useCallback((value: string) => {
    // Prevent rapid re-selection
    if (value === selectedFileId) return;
    
    // Use requestAnimationFrame to batch with other UI updates
    requestAnimationFrame(() => {
      onFileSelect(value);
      setOpen(false);
    });
  }, [selectedFileId, onFileSelect, setOpen]);

  return (
    <div className="transition-all duration-300 will-change-transform">
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
          onValueChange={handleSelectFile}
          disabled={disabled}
        >
          <SelectTrigger 
            id="fileSelect" 
            className="mt-1 relative bg-white transition-all duration-200 border-gray-200 hover:border-gray-300 focus:ring-1 focus:ring-blue-200"
            ref={triggerRef}
            onClick={stopPropagation}
            onMouseDown={stopPropagation}
          >
            <SelectValue placeholder="Choose a file..." />
          </SelectTrigger>
          <SelectContent
            ref={contentRef}
            className="bg-white shadow-lg border border-gray-200 animate-fade-in"
            position="popper"
            sideOffset={5}
            align="start"
            style={{ zIndex: 9999, pointerEvents: 'auto' }}
            onMouseDown={stopPropagation}
            onClick={stopPropagation}
          >
            {memoizedFiles.length === 0 ? (
              <div className="py-6 px-2 text-center">
                <AlertCircle className="mx-auto h-6 w-6 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">No files available</p>
              </div>
            ) : (
              memoizedFiles.map((file) => (
                <SelectItem 
                  key={file.id} 
                  value={file.id}
                  className="flex items-center py-2 px-2"
                >
                  <FileText className="mr-2 h-4 w-4 text-blue-500" />
                  <span className="truncate max-w-[180px]">
                    {file.filename || 'Unnamed file'}
                  </span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.selectedFileId === nextProps.selectedFileId &&
    prevProps.isLoadingFiles === nextProps.isLoadingFiles &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.files.length === nextProps.files.length &&
    JSON.stringify(prevProps.files.map(f => f.id)) === JSON.stringify(nextProps.files.map(f => f.id))
  );
});

FileSelector.displayName = 'FileSelector';

export default FileSelector;
