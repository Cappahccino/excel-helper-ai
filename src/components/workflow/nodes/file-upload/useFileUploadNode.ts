import { useRef, useState, useCallback, useEffect } from 'react';
import { useFileUploadNodeState } from '@/hooks/useFileUploadNodeState';
import { type FileProcessingState, FileProcessingStates } from '@/types/fileProcessing';

export function useFileUploadNode(workflowId: string | null | undefined, nodeId: string) {
  const { fileId, fileName, processingStatus, uploadProgress, errorMessage, schema, selectedSheet, availableSheets, lastUpdated, isLoading, isUploading, isProcessing, isFileReady, hasError, fetchFileState, updateSelectedSheet } = useFileUploadNodeState(workflowId, nodeId);

  return {
    fileId,
    fileName,
    processingStatus,
    uploadProgress,
    errorMessage,
    schema,
    selectedSheet,
    availableSheets,
    lastUpdated,
    isLoading,
    isUploading,
    isProcessing,
    isFileReady,
    hasError,
    fetchFileState,
    updateSelectedSheet,
  };
}
