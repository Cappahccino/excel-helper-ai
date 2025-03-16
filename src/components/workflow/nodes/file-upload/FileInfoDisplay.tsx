
import React from 'react';
import { FileText, Upload, Database, Info } from 'lucide-react';
import FileSchemaDisplay from './FileSchemaDisplay';

interface FileInfoDisplayProps {
  fileInfo: any;
  selectedFileId: string | undefined;
  processingState: {
    status: string;
    progress: number;
  };
  isLoadingSelectedFile: boolean;
  selectedSheet?: string;
  availableSheets: Array<{
    name: string;
    index: number;
    rowCount?: number;
    isDefault?: boolean;
  }>;
  isLoadingSchema: boolean;
  isLoadingSheetSchema: boolean;
  sheetSchema: any;
  formatFileSize: (sizeInBytes: number) => string;
}

const FileInfoDisplay: React.FC<FileInfoDisplayProps> = ({
  fileInfo,
  selectedFileId,
  processingState,
  isLoadingSelectedFile,
  selectedSheet,
  availableSheets,
  isLoadingSchema,
  isLoadingSheetSchema,
  sheetSchema,
  formatFileSize
}) => {
  if (!selectedFileId || !fileInfo || processingState.status !== 'completed' || isLoadingSelectedFile) {
    return null;
  }

  return (
    <div className="bg-gray-50 p-2 rounded-md border border-gray-100">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-4 w-4 text-gray-500" />
        <h4 className="font-medium text-xs truncate">{fileInfo.filename}</h4>
      </div>
      
      <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <Upload className="h-3 w-3" />
          <span>{formatFileSize(fileInfo.file_size || 0)}</span>
        </div>
        
        <div className="flex items-center gap-1">
          <Database className="h-3 w-3" />
          <span>
            {fileInfo.file_metadata?.row_count 
              ? `${fileInfo.file_metadata.row_count} rows` 
              : 'Unknown size'}
          </span>
        </div>
      </div>
      
      {fileInfo.processing_status !== 'completed' && (
        <div className="mt-2 flex items-center gap-2 text-xs text-amber-600">
          <Info className="h-3 w-3" />
          <span>Status: {fileInfo.processing_status}</span>
        </div>
      )}
      
      <FileSchemaDisplay
        isLoadingSchema={isLoadingSchema}
        isLoadingSheetSchema={isLoadingSheetSchema}
        selectedSheet={selectedSheet}
        availableSheets={availableSheets}
        sheetSchema={sheetSchema}
        fileInfo={fileInfo}
      />
    </div>
  );
};

export default FileInfoDisplay;
