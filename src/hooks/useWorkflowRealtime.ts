
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { 
  createWorkflowExecutionSubscription, 
  createWorkflowUpdateSubscription 
} from '@/utils/subscriptionManager';

type SubscriptionStatus = 'idle' | 'subscribing' | 'subscribed' | 'error';

interface UseWorkflowRealtimeProps {
  executionId?: string | null;
  workflowId?: string | null;
  onStatusChange?: (status: string) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export function useWorkflowRealtime({
  executionId,
  workflowId,
  onStatusChange,
  onComplete,
  onError
}: UseWorkflowRealtimeProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('idle');
  const executionSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const workflowSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  // Cleanup function for realtime subscriptions
  const cleanupSubscriptions = useCallback(() => {
    if (executionSubscriptionRef.current) {
      executionSubscriptionRef.current.unsubscribe();
      executionSubscriptionRef.current = null;
    }
    
    if (workflowSubscriptionRef.current) {
      workflowSubscriptionRef.current.unsubscribe();
      workflowSubscriptionRef.current = null;
    }
    
    setSubscriptionStatus('idle');
  }, []);

  // Validation to check if we should subscribe
  const shouldSubscribe = useCallback((id: string | null | undefined): boolean => {
    // Don't subscribe for non-existent, 'new' workflows, or temp workflows that haven't been saved
    if (!id || id === 'new') {
      return false;
    }
    
    return true;
  }, []);

  // Set up subscription to execution updates
  useEffect(() => {
    // Clean up existing subscriptions first
    cleanupSubscriptions();
    
    // Only set up execution subscription if we have a valid ID
    if (shouldSubscribe(executionId)) {
      console.log(`Setting up realtime subscription for execution: ${executionId}`);
      setSubscriptionStatus('subscribing');
      
      executionSubscriptionRef.current = createWorkflowExecutionSubscription(
        executionId as string,
        (payload) => {
          console.log('Received execution update:', payload);
          const updatedExecution = payload.new;
          
          // Ensure status is always converted to string
          const newStatus = updatedExecution.status != null 
            ? (typeof updatedExecution.status === 'string' 
              ? updatedExecution.status 
              : String(updatedExecution.status))
            : null;
          
          setStatus(newStatus);
          
          // Call the onStatusChange callback
          if (onStatusChange && newStatus) {
            onStatusChange(newStatus);
          }
          
          // Handle completion states
          if (['completed', 'failed', 'cancelled'].includes(newStatus || '')) {
            if (newStatus === 'completed') {
              toast.success('Workflow execution completed successfully');
              if (onComplete) onComplete();
            } else if (newStatus === 'failed') {
              const errorMsg = updatedExecution.error || 'Unknown error';
              toast.error(`Workflow execution failed: ${errorMsg}`);
              if (onError) onError(errorMsg);
            } else if (newStatus === 'cancelled') {
              toast.info('Workflow execution was cancelled');
            }
          }
        },
        {
          onStatusChange: (isSubscribed) => {
            setSubscriptionStatus(isSubscribed ? 'subscribed' : 'error');
          }
        }
      );
    }
    
    // Only set up workflow subscription if we have a valid ID
    if (shouldSubscribe(workflowId)) {
      console.log(`Setting up realtime subscription for workflow: ${workflowId}`);
      
      workflowSubscriptionRef.current = createWorkflowUpdateSubscription(
        workflowId as string,
        (payload) => {
          console.log('Received workflow update:', payload);
          const updatedWorkflow = payload.new;
          
          if (updatedWorkflow.last_run_status !== undefined && updatedWorkflow.last_run_status !== null) {
            // Always convert to string to avoid type errors
            const newStatus = typeof updatedWorkflow.last_run_status === 'string'
              ? updatedWorkflow.last_run_status
              : String(updatedWorkflow.last_run_status);
            
            setStatus(newStatus);
            
            // Call the onStatusChange callback
            if (onStatusChange) {
              onStatusChange(newStatus);
            }
          }
        }
      );
    }
    
    // Clean up on unmount or when IDs change
    return () => {
      cleanupSubscriptions();
    };
  }, [executionId, workflowId, cleanupSubscriptions, onStatusChange, onComplete, onError, shouldSubscribe]);

  return {
    status,
    subscriptionStatus,
    cleanupSubscriptions
  };
}
