
import { useState, useCallback } from 'react';
import { FileProcessingState, FileProcessingProgress, FileProcessingStates } from '@/types/fileProcessing';

export function useFileProcessingState(initialState?: Partial<FileProcessingProgress>) {
  const [processingState, setProcessingState] = useState<FileProcessingProgress>({
    status: initialState?.status || FileProcessingStates.PENDING,
    progress: initialState?.progress || 0,
    message: initialState?.message,
    error: initialState?.error,
    startTime: initialState?.startTime,
    endTime: initialState?.endTime
  });

  const updateProcessingState = useCallback((
    status: FileProcessingState, 
    progress: number = 0, 
    message?: string,
    error?: string
  ) => {
    setProcessingState(prev => ({
      ...prev,
      status,
      progress: status === FileProcessingStates.COMPLETED ? 100 : progress,
      message,
      error,
      ...(status === FileProcessingStates.COMPLETED ? { endTime: Date.now() } : {}),
      ...(status === FileProcessingStates.ASSOCIATING && !prev.startTime ? { startTime: Date.now() } : {})
    }));
  }, []);

  // Create arrays for status checks
  const processingStatuses: FileProcessingState[] = [
    FileProcessingStates.UPLOADING, 
    FileProcessingStates.ASSOCIATING, 
    FileProcessingStates.PROCESSING, 
    FileProcessingStates.FETCHING_SCHEMA, 
    FileProcessingStates.VERIFYING
  ];
  
  const errorStatuses: FileProcessingState[] = [
    FileProcessingStates.ERROR, 
    FileProcessingStates.FAILED
  ];

  return {
    processingState,
    updateProcessingState,
    // Add helpers for common status checks
    isProcessing: processingStatuses.includes(processingState.status),
    isComplete: processingState.status === FileProcessingStates.COMPLETED,
    isError: errorStatuses.includes(processingState.status),
    isPending: processingState.status === FileProcessingStates.PENDING
  };
}
