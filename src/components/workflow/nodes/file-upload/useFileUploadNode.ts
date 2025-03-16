
import { useRef, useState, useCallback, useEffect } from 'react';
import { useFileUploadNodeState } from '@/hooks/useFileUploadNodeState';
import { type FileProcessingState, FileProcessingStates } from '@/types/fileProcessing';

export function useFileUploadNode(workflowId: string | null | undefined, nodeId: string) {
  const fileUploadState = useFileUploadNodeState({ workflowId, nodeId });
  
  return {
    fileId: fileUploadState.fileState.fileId,
    fileName: fileUploadState.fileState.fileName,
    processingStatus: fileUploadState.processingState.status,
    uploadProgress: fileUploadState.processingState.progress,
    errorMessage: fileUploadState.processingState.error,
    schema: fileUploadState.schema,
    selectedSheet: fileUploadState.metadata?.selected_sheet,
    availableSheets: fileUploadState.metadata?.sheets_metadata || [],
    lastUpdated: fileUploadState.fileState.lastUpdated,
    isLoading: false, // This is not provided by useFileUploadNodeState, defaulting to false
    isUploading: fileUploadState.isUploading,
    isProcessing: fileUploadState.isProcessing,
    isFileReady: fileUploadState.isComplete,
    hasError: fileUploadState.isError,
    fetchFileState: () => {}, // This function doesn't exist in useFileUploadNodeState, implementing a no-op
    updateSelectedSheet: fileUploadState.updateSelectedSheet,
  };
}
