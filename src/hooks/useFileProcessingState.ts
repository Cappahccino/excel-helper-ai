import { useState, useRef, useCallback, useMemo } from 'react';
import { FileProcessingState } from '@/types/workflowStatus';
import { EnhancedProcessingState, LoadingIndicatorState } from '@/types/fileProcessing';

interface ProcessingStateOptions {
  status: string;
  progress?: number;
  message?: string;
  error?: string;
}

export function useFileProcessingState(
  initialState: ProcessingStateOptions,
  isActive: boolean = true // New parameter to conditionally activate the hook
) {
  // Use a ref to avoid race conditions with batched updates
  const stateRef = useRef<{
    status: string;
    progress: number;
    message?: string;
    error?: string;
    startTime: number;
    endTime?: number;
  }>({
    status: initialState.status,
    progress: initialState.progress || 0,
    message: initialState.message,
    error: initialState.error,
    startTime: Date.now(),
    endTime: undefined,
  });

  // Actual state for re-rendering
  const [processingState, setProcessingState] = useState<{
    status: string;
    progress: number;
    message?: string;
    error?: string;
    startTime: number;
    endTime?: number;
  }>({
    status: initialState.status,
    progress: initialState.progress || 0,
    message: initialState.message,
    error: initialState.error,
    startTime: Date.now(),
    endTime: undefined,
  });

  // Keep internal state ref in sync with actual state
  stateRef.current = processingState;

  // Function to update the processing state with batched updates
  const updateProcessingState = useCallback((
    status: FileProcessingState | string,
    progress = 0,
    message?: string,
    error?: string
  ) => {
    // Skip updates if the hook is not active
    if (!isActive) return;
    
    // Update ref immediately
    const now = Date.now();
    const isComplete = status === FileProcessingState.Completed;
    const isError = status === FileProcessingState.Error || status === FileProcessingState.Failed;
    
    // Use RAF to avoid flickering - but only when active
    requestAnimationFrame(() => {
      setProcessingState({
        status,
        progress,
        message,
        error,
        startTime: stateRef.current.startTime || now,
        endTime: (isComplete || isError) ? now : undefined,
      });
    });
  }, [isActive]);

  // Enhanced state with computed properties - use useMemo to prevent recalculation
  const enhancedState = useMemo<EnhancedProcessingState>(() => ({
    status: processingState.status as FileProcessingState,
    progress: processingState.progress,
    message: processingState.message,
    error: processingState.error,
    startTime: processingState.startTime,
    endTime: processingState.endTime,
    isProcessing: [
      FileProcessingState.Associating,
      FileProcessingState.Queuing,
      FileProcessingState.Processing,
      FileProcessingState.FetchingSchema,
      FileProcessingState.Verifying
    ].includes(processingState.status as FileProcessingState),
    isComplete: processingState.status === FileProcessingState.Completed,
    isError: [
      FileProcessingState.Error,
      FileProcessingState.Failed
    ].includes(processingState.status as FileProcessingState),
    isPending: processingState.status === FileProcessingState.Pending,
    displayMessage: processingState.message || getDefaultMessage(processingState.status),
    elapsedTimeMs: processingState.endTime 
      ? processingState.endTime - processingState.startTime 
      : Date.now() - processingState.startTime,
    processingDuration: getFormattedDuration(
      processingState.startTime,
      processingState.endTime || Date.now()
    )
  }), [processingState]);

  // Loading indicator state for UI feedback - also memoized
  const loadingIndicatorState = useMemo<LoadingIndicatorState>(() => ({
    showGlow: enhancedState.isProcessing || enhancedState.isError,
    glowColor: enhancedState.isError ? 'red' : enhancedState.isComplete ? 'green' : 'blue',
    pulseAnimation: enhancedState.isProcessing,
    progressVisible: enhancedState.isProcessing || enhancedState.isComplete || enhancedState.isError,
    showSpinner: enhancedState.isProcessing && !enhancedState.isComplete && !enhancedState.isError
  }), [enhancedState]);

  return {
    processingState,
    updateProcessingState,
    enhancedState,
    loadingIndicatorState
  };
}

// Helper function to get a default message based on status
function getDefaultMessage(status: string): string {
  switch (status) {
    case FileProcessingState.Associating:
      return 'Associating file...';
    case FileProcessingState.Queuing:
      return 'Queueing file for processing...';
    case FileProcessingState.Processing:
      return 'Processing file...';
    case FileProcessingState.FetchingSchema:
      return 'Fetching schema...';
    case FileProcessingState.Verifying:
      return 'Verifying file...';
    case FileProcessingState.Completed:
      return 'File ready';
    case FileProcessingState.Failed:
    case FileProcessingState.Error:
      return 'Error processing file';
    case FileProcessingState.Pending:
    default:
      return 'Ready';
  }
}

// Helper function to format duration
function getFormattedDuration(startTime: number, endTime: number): string {
  const durationMs = endTime - startTime;
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  } else if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m${seconds}s`;
  }
}
