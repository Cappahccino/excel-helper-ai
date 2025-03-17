
import React, { useEffect } from 'react';
import { FileText, AlertCircle, Upload } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
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
  // Auto-select the first file if none is selected and files are available
  useEffect(() => {
    if (!selectedFileId && files && files.length > 0 && !disabled && !isLoadingFiles) {
      console.log('Auto-selecting first file:', files[0].id);
      onFileSelect(files[0].id);
    }
  }, [files, selectedFileId, disabled, isLoadingFiles, onFileSelect]);

  const handleValueChange = (fileId: string) => {
    if (fileId === selectedFileId) {
      console.log('Same file selected, ignoring duplicate selection');
      return;
    }
    
    console.log('File selected:', fileId);
    onFileSelect(fileId);
  };

  // Debug logging to trace file list
  useEffect(() => {
    if (files) {
      console.log(`FileSelector: ${files.length} files available`);
      if (files.length === 0) {
        console.log('FileSelector: No files available. Please upload files in the Files section.');
      }
    } else {
      console.log('FileSelector: files is undefined');
    }
  }, [files]);

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
          onValueChange={handleValueChange}
          disabled={disabled}
        >
          <SelectTrigger id="fileSelect" className="mt-1">
            <SelectValue placeholder="Choose a file..." />
          </SelectTrigger>
          <SelectContent>
            {!files || files.length === 0 ? (
              <div className="py-6 px-2 text-center">
                <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No files found</p>
                <p className="text-xs text-gray-400 mt-1">Upload files in the Files section</p>
              </div>
            ) : (
              files.map((file) => (
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
    </div>
  );
};

export default FileSelector;
