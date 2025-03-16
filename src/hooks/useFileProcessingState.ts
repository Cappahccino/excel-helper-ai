
import { useState, useCallback } from 'react';
import { FileProcessingStatus, FileProcessingState } from '@/types/fileProcessing';

export function useFileProcessingState(initialState?: Partial<FileProcessingState>) {
  const [processingState, setProcessingState] = useState<FileProcessingState>({
    status: initialState?.status || 'pending',
    progress: initialState?.progress || 0,
    message: initialState?.message,
    error: initialState?.error,
    startTime: initialState?.startTime,
    endTime: initialState?.endTime,
    glowing: initialState?.glowing || false
  });

  const updateProcessingState = useCallback((
    status: FileProcessingStatus, 
    progress: number = 0, 
    message?: string,
    error?: string,
    glowing?: boolean
  ) => {
    setProcessingState(prev => ({
      ...prev,
      status,
      progress: status === 'completed' ? 100 : progress,
      message,
      error,
      glowing: glowing !== undefined ? glowing : ['uploading', 'associating', 'processing', 'fetching_schema', 'verifying'].includes(status),
      ...(status === 'completed' ? { endTime: Date.now(), glowing: false } : {}),
      ...(status === 'associating' && !prev.startTime ? { startTime: Date.now() } : {})
    }));
  }, []);

  const resetProcessingState = useCallback(() => {
    setProcessingState({
      status: 'pending',
      progress: 0,
      glowing: false
    });
  }, []);

  return {
    processingState,
    updateProcessingState,
    resetProcessingState,
    // Add helpers for common status checks
    isProcessing: ['uploading', 'associating', 'processing', 'fetching_schema', 'verifying'].includes(processingState.status),
    isComplete: processingState.status === 'completed',
    isError: ['error', 'failed'].includes(processingState.status),
    isPending: processingState.status === 'pending',
    // Glowing state for visual effects
    isGlowing: processingState.glowing
  };
}
