
import { useState, useCallback } from 'react';
import { FileProcessingStatus, FileProcessingState } from '@/types/fileProcessing';
import { NodeStatus } from '@/hooks/useNodeStatus';

// Map from our new NodeStatus to FileProcessingStatus
const mapToFileProcessingStatus = (status: NodeStatus): FileProcessingStatus => {
  switch (status) {
    case 'idle':
      return 'pending';
    case 'loading':
      return 'uploading';
    case 'processing':
      return 'processing';
    case 'success':
      return 'completed';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
};

export function useFileProcessingState(initialState?: Partial<FileProcessingState>) {
  const [processingState, setProcessingState] = useState<FileProcessingState>({
    status: initialState?.status || 'pending',
    progress: initialState?.progress || 0,
    message: initialState?.message,
    error: initialState?.error,
    startTime: initialState?.startTime,
    endTime: initialState?.endTime
  });

  const updateProcessingState = useCallback((
    status: FileProcessingStatus, 
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
      ...(status === 'associating' && !prev.startTime ? { startTime: Date.now() } : {})
    }));
  }, []);

  // Convert a NodeStatus to our FileProcessingState
  const updateFromNodeStatus = useCallback((
    nodeStatus: NodeStatus,
    progress: number = 0,
    message?: string,
    error?: string
  ) => {
    const fileStatus = mapToFileProcessingStatus(nodeStatus);
    updateProcessingState(fileStatus, progress, message, error);
  }, [updateProcessingState]);

  return {
    processingState,
    updateProcessingState,
    updateFromNodeStatus,
    // Add helpers for common status checks
    isProcessing: ['uploading', 'associating', 'processing', 'fetching_schema', 'verifying'].includes(processingState.status),
    isComplete: processingState.status === 'completed',
    isError: ['error', 'failed'].includes(processingState.status),
    isPending: processingState.status === 'pending'
  };
}
