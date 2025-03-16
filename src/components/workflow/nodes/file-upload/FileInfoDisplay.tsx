
import React from 'react';
import { FileText, Upload, Database, Info } from 'lucide-react';
import FileSchemaDisplay from './FileSchemaDisplay';

interface FileInfoDisplayProps {
  file: any;
  selectedSheet?: {
    name: string;
    index: number;
    rowCount?: number;
    isDefault?: boolean;
  };
}

const FileInfoDisplay: React.FC<FileInfoDisplayProps> = ({
  file,
  selectedSheet
}) => {
  if (!file) {
    return null;
  }

  const formatFileSize = (sizeInBytes: number): string => {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-gray-50 p-2 rounded-md border border-gray-100">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-4 w-4 text-gray-500" />
        <h4 className="font-medium text-xs truncate">{file.filename}</h4>
      </div>
      
      <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <Upload className="h-3 w-3" />
          <span>{formatFileSize(file.file_size || 0)}</span>
        </div>
        
        <div className="flex items-center gap-1">
          <Database className="h-3 w-3" />
          <span>
            {file.file_metadata?.row_count 
              ? `${file.file_metadata.row_count} rows` 
              : 'Unknown size'}
          </span>
        </div>
      </div>
      
      {file.processing_status !== 'completed' && (
        <div className="mt-2 flex items-center gap-2 text-xs text-amber-600">
          <Info className="h-3 w-3" />
          <span>Status: {file.processing_status}</span>
        </div>
      )}
      
      {selectedSheet && (
        <div className="mt-2">
          <p className="text-xs font-medium text-gray-600">
            Selected Sheet: {selectedSheet.name} 
            {selectedSheet.rowCount ? ` (${selectedSheet.rowCount} rows)` : ''}
          </p>
        </div>
      )}
    </div>
  );
};

export default FileInfoDisplay;
