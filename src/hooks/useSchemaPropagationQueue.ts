
import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { isNodeReadyForSchemaPropagation } from '@/utils/schemaPropagation';

export interface PropagationTask {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sheetName?: string;
  attempts: number;
  lastAttempt: number;
  status: 'pending' | 'processing' | 'success' | 'failed';
}

export function useSchemaPropagationQueue(workflowId: string | undefined) {
  const [queue, setQueue] = useState<PropagationTask[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const propagateSchemaRef = useRef<(sourceNodeId: string, targetNodeId: string, sheetName?: string) => Promise<boolean>>();
  const workflowIdRef = useRef<string | undefined>(workflowId);
  const processingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update workflow ID ref when it changes
  useEffect(() => {
    workflowIdRef.current = workflowId;
  }, [workflowId]);

  // Store the propagate function for use in the queue processor
  const setPropagateFunction = useCallback((fn: (sourceNodeId: string, targetNodeId: string, sheetName?: string) => Promise<boolean>) => {
    propagateSchemaRef.current = fn;
  }, []);

  // Add a task to the queue
  const addToQueue = useCallback((sourceNodeId: string, targetNodeId: string, sheetName?: string): string => {
    const taskId = `${sourceNodeId}-${targetNodeId}-${Date.now()}`;
    
    setQueue(currentQueue => {
      // Check if a similar task already exists
      const existingTask = currentQueue.find(
        task => task.sourceNodeId === sourceNodeId && 
               task.targetNodeId === targetNodeId &&
               task.status !== 'success'
      );
      
      if (existingTask) {
        console.log(`Similar task already exists for ${sourceNodeId} -> ${targetNodeId}, updating`);
        return currentQueue.map(task => 
          task.id === existingTask.id 
            ? { ...task, sheetName, attempts: 0, lastAttempt: Date.now(), status: 'pending' }
            : task
        );
      }
      
      return [...currentQueue, {
        id: taskId,
        sourceNodeId,
        targetNodeId,
        sheetName,
        attempts: 0,
        lastAttempt: 0,
        status: 'pending'
      }];
    });
    
    return taskId;
  }, []);

  // Check if a node is ready for schema propagation
  const isNodeReady = useCallback(async (nodeId: string): Promise<boolean> => {
    if (!workflowIdRef.current) return false;
    
    try {
      return await isNodeReadyForSchemaPropagation(workflowIdRef.current, nodeId);
    } catch (error) {
      console.error(`Error checking if node ${nodeId} is ready:`, error);
      return false;
    }
  }, []);

  // Process the queue
  const processQueue = useCallback(async () => {
    if (isProcessing || !propagateSchemaRef.current || !workflowIdRef.current) return;
    
    setIsProcessing(true);
    
    try {
      const currentQueue = [...queue];
      
      // Find the next pending task
      const nextTask = currentQueue.find(task => task.status === 'pending');
      if (!nextTask) {
        setIsProcessing(false);
        return;
      }
      
      // Update task status to processing
      setQueue(currentQueue => 
        currentQueue.map(task => 
          task.id === nextTask.id ? { ...task, status: 'processing' } : task
        )
      );
      
      // Check if source node is ready
      const isSourceReady = await isNodeReady(nextTask.sourceNodeId);
      if (!isSourceReady) {
        console.log(`Source node ${nextTask.sourceNodeId} not ready for schema propagation, delaying`);
        
        // Set back to pending but with incremented attempts
        setQueue(currentQueue => 
          currentQueue.map(task => 
            task.id === nextTask.id 
              ? { 
                  ...task, 
                  status: 'pending', 
                  attempts: task.attempts + 1,
                  lastAttempt: Date.now()
                } 
              : task
          )
        );
        
        // If we've tried too many times, mark as failed
        if (nextTask.attempts >= 5) {
          console.log(`Too many attempts for ${nextTask.sourceNodeId} -> ${nextTask.targetNodeId}, marking as failed`);
          setQueue(currentQueue => 
            currentQueue.map(task => 
              task.id === nextTask.id ? { ...task, status: 'failed' } : task
            )
          );
        }
        
        setIsProcessing(false);
        return;
      }
      
      // Attempt to propagate schema
      console.log(`Attempting schema propagation for ${nextTask.sourceNodeId} -> ${nextTask.targetNodeId}`);
      const success = await propagateSchemaRef.current(
        nextTask.sourceNodeId, 
        nextTask.targetNodeId,
        nextTask.sheetName
      );
      
      // Update task status based on result
      if (success) {
        console.log(`Schema propagation successful for ${nextTask.sourceNodeId} -> ${nextTask.targetNodeId}`);
        setQueue(currentQueue => 
          currentQueue.map(task => 
            task.id === nextTask.id ? { ...task, status: 'success' } : task
          )
        );
      } else {
        console.log(`Schema propagation failed for ${nextTask.sourceNodeId} -> ${nextTask.targetNodeId}`);
        
        // Increment attempts and set back to pending for retry
        const updatedAttempts = nextTask.attempts + 1;
        const maxAttempts = 5;
        
        if (updatedAttempts >= maxAttempts) {
          setQueue(currentQueue => 
            currentQueue.map(task => 
              task.id === nextTask.id ? { ...task, status: 'failed' } : task
            )
          );
          
          toast.error(`Failed to propagate schema after ${maxAttempts} attempts`);
        } else {
          // Use exponential backoff for retries
          const backoffDelay = Math.min(30000, 1000 * Math.pow(2, updatedAttempts));
          
          console.log(`Will retry in ${backoffDelay}ms (attempt ${updatedAttempts}/${maxAttempts})`);
          
          setQueue(currentQueue => 
            currentQueue.map(task => 
              task.id === nextTask.id 
                ? { 
                    ...task, 
                    status: 'pending', 
                    attempts: updatedAttempts,
                    lastAttempt: Date.now()
                  } 
                : task
            )
          );
        }
      }
    } catch (error) {
      console.error('Error processing schema propagation queue:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [queue, isProcessing, isNodeReady]);

  // Automatically process the queue when tasks are added or when a task completes
  useEffect(() => {
    if (!isProcessing && queue.some(task => task.status === 'pending')) {
      // Clear any existing timer
      if (processingTimerRef.current) {
        clearTimeout(processingTimerRef.current);
      }
      
      // Start processing after a short delay
      processingTimerRef.current = setTimeout(() => {
        processQueue();
      }, 500);
    }
    
    return () => {
      if (processingTimerRef.current) {
        clearTimeout(processingTimerRef.current);
      }
    };
  }, [queue, isProcessing, processQueue]);

  // Clear completed or failed tasks older than a certain age
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const twoHoursAgo = now - (2 * 60 * 60 * 1000);
      
      setQueue(currentQueue => 
        currentQueue.filter(task => 
          !(
            (task.status === 'success' || task.status === 'failed') && 
            task.lastAttempt < twoHoursAgo
          )
        )
      );
    }, 30 * 60 * 1000); // Run every 30 minutes
    
    return () => clearInterval(cleanupInterval);
  }, []);

  return {
    addToQueue,
    queue,
    isProcessing,
    setPropagateFunction,
    processQueue
  };
}
