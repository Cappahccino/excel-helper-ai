
import { useState, useCallback } from 'react';
import { FileProcessingStatus, FileProcessingState } from '@/types/fileProcessing';

/**
 * Custom hook for managing file processing state with optimized updates
 */
export function useFileProcessingState(initialState: FileProcessingState = { status: 'pending', progress: 0 }) {
  const [processingState, setProcessingState] = useState<FileProcessingState>(initialState);
  
  // Optimized state update function that prevents unnecessary re-renders
  const updateProcessingState = useCallback((
    status: FileProcessingStatus, 
    progress: number = 0, 
    message?: string,
    error?: string
  ) => {
    setProcessingState(prev => {
      // Skip update if nothing has changed
      if (prev.status === status && 
          prev.progress === progress && 
          prev.message === message &&
          prev.error === error) {
        return prev;
      }
      
      return {
        ...prev,
        status,
        progress: status === 'completed' ? 100 : progress,
        message,
        error,
        ...(status === 'completed' ? { endTime: Date.now() } : {}),
        ...(status === 'associating' && !prev.startTime ? { startTime: Date.now() } : {})
      };
    });
  }, []);
  
  return {
    processingState,
    updateProcessingState
  };
}
