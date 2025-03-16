
import { useState, useCallback } from 'react';

export type ProcessingStatus = 
  | 'pending' 
  | 'uploading' 
  | 'processing' 
  | 'analyzing'
  | 'completed' 
  | 'error';

interface ProcessingProgress {
  status: ProcessingStatus;
  progress: number;
  message?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export function useProcessingStatus(initialStatus: ProcessingStatus = 'pending') {
  const [processingState, setProcessingState] = useState<ProcessingProgress>({
    status: initialStatus,
    progress: 0
  });

  const updateStatus = useCallback((
    status: ProcessingStatus, 
    progress: number = 0, 
    message?: string,
    error?: string
  ) => {
    setProcessingState(prev => ({
      ...prev,
      status,
      progress: status === 'completed' ? 100 : progress,
      message,
      error,
      ...(status === 'completed' ? { endTime: Date.now() } : {}),
      ...(status === 'uploading' && !prev.startTime ? { startTime: Date.now() } : {})
    }));
  }, []);

  return {
    processingState,
    updateStatus,
    status: processingState.status,
    progress: processingState.progress,
    error: processingState.error,
    message: processingState.message,
    // Add helper flags
    isLoading: ['pending', 'uploading', 'processing', 'analyzing'].includes(processingState.status),
    isComplete: processingState.status === 'completed',
    hasError: processingState.status === 'error'
  };
}
