
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
  const retryTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Update workflow ID ref when it changes
  useEffect(() => {
    workflowIdRef.current = workflowId;
  }, [workflowId]);

  // Store the propagate function for use in the queue processor
  const setPropagateFunction = useCallback((fn: (sourceNodeId: string, targetNodeId: string, sheetName?: string) => Promise<boolean>) => {
    propagateSchemaRef.current = fn;
  }, []);

  // Check if a node is ready for schema propagation
  const isNodeReady = useCallback(async (nodeId: string): Promise<boolean> => {
    if (!workflowIdRef.current) return false;
    
    try {
      const result = await isNodeReadyForSchemaPropagation(workflowIdRef.current, nodeId);
      console.log(`Node ${nodeId} readiness check result: ${result}`);
      return result;
    } catch (error) {
      console.error(`Error checking if node ${nodeId} is ready:`, error);
      return false;
    }
  }, []);

  // Add a task to the queue
  const addToQueue = useCallback((sourceNodeId: string, targetNodeId: string, sheetName?: string): string => {
    const taskId = `${sourceNodeId}-${targetNodeId}-${Date.now()}`;
    
    console.log(`Adding schema propagation task to queue: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName || 'not specified'}`);
    
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

  // Process the queue - declaration moved up to solve circular reference
  const processQueue = useCallback(async () => {
    if (isProcessing || !propagateSchemaRef.current || !workflowIdRef.current) {
      console.log(`Cannot process queue: ${isProcessing ? 'already processing' : !propagateSchemaRef.current ? 'no propagate function' : 'no workflow ID'}`);
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const currentQueue = [...queue];
      
      // Find the next pending task
      const nextTask = currentQueue.find(task => task.status === 'pending');
      if (!nextTask) {
        console.log('No pending tasks in the queue');
        setIsProcessing(false);
        return;
      }
      
      console.log(`Processing task ${nextTask.id}: ${nextTask.sourceNodeId} -> ${nextTask.targetNodeId}`);
      
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
        const updatedAttempts = nextTask.attempts + 1;
        const maxAttempts = 10; // Increase max attempts
        
        if (updatedAttempts >= maxAttempts) {
          console.log(`Too many attempts (${updatedAttempts}/${maxAttempts}) for ${nextTask.sourceNodeId} -> ${nextTask.targetNodeId}, marking as failed`);
          setQueue(currentQueue => 
            currentQueue.map(task => 
              task.id === nextTask.id ? { ...task, status: 'failed' } : task
            )
          );
          
          toast.error(`Schema propagation failed after ${maxAttempts} attempts. Try refreshing the page or manually syncing.`);
        } else {
          // Use exponential backoff for retries with jitter
          const baseDelay = Math.min(30000, 1000 * Math.pow(1.5, updatedAttempts));
          const jitter = Math.random() * 1000;
          const backoffDelay = Math.floor(baseDelay + jitter);
          
          console.log(`Will retry task ${nextTask.id} in ${backoffDelay}ms (attempt ${updatedAttempts}/${maxAttempts})`);
          
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
          
          // Set up a dedicated timer for this specific task to retry
          if (retryTimersRef.current[nextTask.id]) {
            clearTimeout(retryTimersRef.current[nextTask.id]);
          }
          
          retryTimersRef.current[nextTask.id] = setTimeout(() => {
            // Check if this task is still in the queue and pending
            setQueue(currentQueue => {
              const taskStillPending = currentQueue.find(t => t.id === nextTask.id && t.status === 'pending');
              if (taskStillPending) {
                console.log(`Retry timer triggered for task ${nextTask.id}`);
                // Force queue processing if the task is still pending
                if (!isProcessing) {
                  processQueue();
                }
              }
              return currentQueue;
            });
          }, backoffDelay);
        }
        
        setIsProcessing(false);
        return;
      }
      
      // Attempt to propagate schema
      console.log(`Attempting schema propagation for ${nextTask.sourceNodeId} -> ${nextTask.targetNodeId}, sheet: ${nextTask.sheetName || 'default'}`);
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
            task.id === nextTask.id ? { ...task, status: 'success', lastAttempt: Date.now() } : task
          )
        );
      } else {
        console.log(`Schema propagation failed for ${nextTask.sourceNodeId} -> ${nextTask.targetNodeId}`);
        
        // Increment attempts and set back to pending for retry
        const updatedAttempts = nextTask.attempts + 1;
        const maxAttempts = 10;
        
        if (updatedAttempts >= maxAttempts) {
          setQueue(currentQueue => 
            currentQueue.map(task => 
              task.id === nextTask.id ? { ...task, status: 'failed', lastAttempt: Date.now() } : task
            )
          );
          
          toast.error(`Failed to propagate schema after ${maxAttempts} attempts. Try manually syncing.`);
        } else {
          // Use exponential backoff for retries
          const backoffDelay = Math.min(30000, 1000 * Math.pow(1.5, updatedAttempts));
          
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
          
          // Set up a dedicated timer for this specific task to retry
          if (retryTimersRef.current[nextTask.id]) {
            clearTimeout(retryTimersRef.current[nextTask.id]);
          }
          
          retryTimersRef.current[nextTask.id] = setTimeout(() => {
            setQueue(currentQueue => {
              const taskStillPending = currentQueue.find(t => t.id === nextTask.id && t.status === 'pending');
              if (taskStillPending) {
                if (!isProcessing) {
                  processQueue();
                }
              }
              return currentQueue;
            });
          }, backoffDelay);
        }
      }
    } catch (error) {
      console.error('Error processing schema propagation queue:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [queue, isProcessing, isNodeReady]);  // processQueue properly depends on these values

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
      
      // Clean up any retry timers
      Object.values(retryTimersRef.current).forEach(timer => {
        clearTimeout(timer);
      });
      retryTimersRef.current = {};
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
