
import React, { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileUploadNodeData } from '@/types/workflow';
import FileSelector from './FileSelector';
import FileInfoDisplay from './FileInfoDisplay';
import FileSchemaDisplay from './FileSchemaDisplay';
import SheetSelector from './SheetSelector';
import { useFileUploadNode } from './useFileUploadNode';
import FileProcessingStatus from './FileProcessingStatus';
import { cn } from '@/lib/utils';

interface FileUploadNodeProps {
  id: string;
  data: FileUploadNodeData;
  selected: boolean;
}

const FileUploadNode: React.FC<FileUploadNodeProps> = ({ id, data, selected }) => {
  const { config = {}, workflowId, onChange } = data;
  
  const { 
    selectedFileId, 
    selectedSheet, 
    availableSheets,
    files, 
    isLoadingFiles,
    isLoadingSchema,
    isLoadingSheetSchema,
    sheetSchema,
    processingState,
    fileInfo,
    handleFileSelection,
    handleSheetSelection,
    handleRetry,
    isProcessing,
    isGlowing
  } = useFileUploadNode(workflowId || null, id, config, onChange);

  const getHighlightClass = useCallback(() => {
    if (selected) return 'border-blue-500 shadow-md';
    if (isProcessing) return 'border-amber-400';
    return 'border-gray-300';
  }, [selected, isProcessing]);

  // Find the selected sheet object from availableSheets
  const selectedSheetObject = selectedSheet ? 
    availableSheets.find(s => s.name === selectedSheet) : 
    undefined;

  return (
    <div 
      className={cn(
        "bg-white rounded-lg border-2 w-[300px] transition-all duration-200",
        getHighlightClass(),
        isGlowing ? 'animate-pulse shadow-lg shadow-amber-200' : '',
        isProcessing ? 'ring-2 ring-amber-300 ring-opacity-50' : ''
      )}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2" />
      
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">{data.label || 'File Upload'}</h3>
          {isProcessing && (
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </div>
          )}
        </div>
        
        <div className="space-y-4">
          <FileSelector
            selectedFileId={selectedFileId}
            files={files || []}
            isLoadingFiles={isLoadingFiles}
            onFileSelect={handleFileSelection}
            disabled={isProcessing}
          />
          
          {processingState.status !== 'pending' && (
            <FileProcessingStatus
              status={processingState.status}
              progress={processingState.progress}
              message={processingState.message}
              error={processingState.error}
              onRetry={handleRetry}
            />
          )}
          
          {fileInfo && availableSheets.length > 0 && (
            <SheetSelector
              selectedSheet={selectedSheet}
              availableSheets={availableSheets}
              onSheetSelect={handleSheetSelection}
              isLoading={fileInfo.isLoading}
              disabled={isProcessing}
            />
          )}
          
          {fileInfo && (
            <FileInfoDisplay
              file={fileInfo}
              selectedSheet={selectedSheetObject}
            />
          )}
          
          {sheetSchema && selectedSheet && !isLoadingSheetSchema && (
            <FileSchemaDisplay
              schemaData={{
                columns: sheetSchema.columns || [],
                data_types: sheetSchema.data_types as Record<string, string> || {},
                sample_data: sheetSchema.sample_data || []
              }}
              isLoading={isLoadingSchema}
            />
          )}
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
    </div>
  );
};

export default FileUploadNode;
