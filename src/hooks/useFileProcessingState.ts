
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { FileProcessingStatus, FileProcessingState, EnhancedProcessingState, LoadingIndicatorState } from '@/types/fileProcessing';

export function useFileProcessingState(initialState?: Partial<FileProcessingState>) {
  const [processingState, setProcessingState] = useState<FileProcessingState>({
    status: initialState?.status || 'pending',
    progress: initialState?.progress || 0,
    message: initialState?.message,
    error: initialState?.error,
    startTime: initialState?.startTime,
    endTime: initialState?.endTime,
    isLoading: initialState?.isLoading || false
  });

  // Use a ref to track animation frame requests
  const animationFrameRef = useRef<number | null>(null);
  // Use a ref to track the latest state to avoid stale closures
  const stateRef = useRef(processingState);
  
  // Update the ref whenever the state changes
  useEffect(() => {
    stateRef.current = processingState;
  }, [processingState]);

  // Optimized update function that batches state changes using requestAnimationFrame
  const updateProcessingState = useCallback((
    status: FileProcessingStatus, 
    progress: number = 0, 
    message?: string,
    error?: string
  ) => {
    // Cancel any pending animation frame to avoid multiple updates
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Schedule the update in the next animation frame for smoother rendering
    animationFrameRef.current = requestAnimationFrame(() => {
      const currentState = stateRef.current;
      
      // Only update if something actually changed
      if (currentState.status === status && 
          currentState.progress === progress && 
          currentState.message === message && 
          currentState.error === error) {
        return;
      }
      
      setProcessingState(prev => ({
        ...prev,
        status,
        progress: status === 'completed' ? 100 : progress,
        message,
        error,
        isLoading: ['uploading', 'associating', 'processing', 'fetching_schema', 'verifying', 'queuing'].includes(status),
        ...(status === 'completed' ? { endTime: Date.now() } : {}),
        ...(status === 'associating' && !prev.startTime ? { startTime: Date.now() } : {})
      }));
    });
  }, []);

  // Clean up any pending animation frames on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // For elapsed time calculation
  const [, setUpdateTrigger] = useState(0);
  
  // Only update the timer if we're in a loading state
  useEffect(() => {
    if (!processingState.isLoading || !processingState.startTime) return;
    
    const intervalId = setInterval(() => {
      setUpdateTrigger(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(intervalId);
  }, [processingState.isLoading, processingState.startTime]);

  // Memoize the enhanced state to prevent unnecessary recalculations
  const enhancedState = useMemo<EnhancedProcessingState>(() => {
    const isProcessing = ['uploading', 'associating', 'processing', 'fetching_schema', 'verifying', 'queuing'].includes(processingState.status);
    const isComplete = processingState.status === 'completed';
    const isError = ['error', 'failed'].includes(processingState.status);
    const isPending = processingState.status === 'pending';
    
    let displayMessage = processingState.message || '';
    if (!displayMessage) {
      if (isProcessing) displayMessage = `Processing... (${processingState.progress}%)`;
      else if (isComplete) displayMessage = 'Processing complete';
      else if (isError) displayMessage = processingState.error || 'An error occurred';
      else displayMessage = 'Ready to process';
    }
    
    let elapsedTimeMs: number | undefined;
    let processingDuration: string | undefined;
    
    if (processingState.startTime) {
      const endTime = processingState.endTime || Date.now();
      elapsedTimeMs = endTime - processingState.startTime;
      
      if (elapsedTimeMs < 1000) {
        processingDuration = `${elapsedTimeMs}ms`;
      } else if (elapsedTimeMs < 60000) {
        processingDuration = `${Math.round(elapsedTimeMs / 1000)}s`;
      } else {
        const minutes = Math.floor(elapsedTimeMs / 60000);
        const seconds = Math.floor((elapsedTimeMs % 60000) / 1000);
        processingDuration = `${minutes}m ${seconds}s`;
      }
    }
    
    return {
      ...processingState,
      isProcessing,
      isComplete,
      isError,
      isPending,
      displayMessage,
      elapsedTimeMs,
      processingDuration
    };
  }, [processingState]);

  // Also memoize the loading indicator state
  const loadingIndicatorState = useMemo<LoadingIndicatorState>(() => {
    const { status, progress } = processingState;
    
    let glowColor = 'blue';
    if (status === 'completed') glowColor = 'green';
    else if (['error', 'failed'].includes(status)) glowColor = 'red';
    else if (status === 'verifying') glowColor = 'amber';
    
    return {
      showGlow: status !== 'pending',
      glowColor,
      pulseAnimation: ['uploading', 'associating', 'processing', 'fetching_schema', 'verifying', 'queuing'].includes(status),
      progressVisible: ['uploading', 'associating', 'processing', 'fetching_schema', 'verifying', 'queuing'].includes(status),
      showSpinner: ['uploading', 'associating', 'processing', 'fetching_schema', 'verifying', 'queuing'].includes(status)
    };
  }, [processingState.status, processingState.progress]);

  return {
    processingState,
    updateProcessingState,
    enhancedState,
    loadingIndicatorState,
    isProcessing: enhancedState.isProcessing,
    isComplete: enhancedState.isComplete,
    isError: enhancedState.isError,
    isPending: enhancedState.isPending
  };
}
