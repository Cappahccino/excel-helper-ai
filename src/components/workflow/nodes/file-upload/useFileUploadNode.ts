
import { useCallback } from 'react';
import { useFileUploadNodeState } from '@/hooks/useFileUploadNodeState';
import { type FileProcessingState } from '@/types/fileProcessing';

export function useFileUploadNode(workflowId: string | null | undefined, nodeId: string) {
  const fileUploadState = useFileUploadNodeState({ workflowId, nodeId });
  
  // Handle case when metadata might be undefined
  const selectedSheet = fileUploadState.metadata?.selected_sheet;
  const availableSheets = fileUploadState.metadata?.sheets || [];
  
  return {
    fileId: fileUploadState.fileState.fileId,
    fileName: fileUploadState.fileState.fileName,
    processingStatus: fileUploadState.processingState.status,
    uploadProgress: fileUploadState.processingState.progress,
    errorMessage: fileUploadState.processingState.error,
    schema: fileUploadState.schema,
    selectedSheet,
    availableSheets,
    lastUpdated: fileUploadState.fileState.lastUpdated,
    isLoading: false, // Not provided by useFileUploadNodeState, defaulting to false
    isUploading: fileUploadState.isUploading,
    isProcessing: fileUploadState.isProcessing,
    isFileReady: fileUploadState.isComplete,
    hasError: fileUploadState.isError,
    fetchFileState: useCallback(() => {
      // This is a no-op function since useFileUploadNodeState doesn't expose this
      console.log('fetchFileState called but not implemented');
    }, []),
    updateSelectedSheet: fileUploadState.updateSelectedSheet,
  };
}
