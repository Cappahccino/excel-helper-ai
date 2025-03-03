
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const channelsRef = useRef<any[]>([]);

  // Cleanup function for realtime subscriptions
  const cleanupSubscriptions = useCallback(() => {
    if (channelsRef.current.length > 0) {
      console.log('Cleaning up realtime subscriptions');
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    }
    setSubscriptionStatus('idle');
  }, []);

  // Set up subscription to execution updates
  const subscribeToExecution = useCallback((execId: string) => {
    if (!execId) return;
    
    console.log(`Setting up realtime subscription for execution: ${execId}`);
    setSubscriptionStatus('subscribing');
    
    try {
      const channel = supabase
        .channel(`execution-${execId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'workflow_executions',
            filter: `id=eq.${execId}`
          },
          (payload) => {
            console.log('Received execution update:', payload);
            const updatedExecution = payload.new;
            
            // Convert status to string to avoid type errors
            const newStatus = updatedExecution.status != null ? String(updatedExecution.status) : null;
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
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`Successfully subscribed to execution updates for ${execId}`);
            setSubscriptionStatus('subscribed');
          } else {
            console.error(`Error subscribing to execution updates: ${status}`);
            setSubscriptionStatus('error');
          }
        });
      
      channelsRef.current.push(channel);
      return channel;
    } catch (error) {
      console.error('Error setting up realtime subscription:', error);
      setSubscriptionStatus('error');
      return null;
    }
  }, [onStatusChange, onComplete, onError]);

  // Set up subscription to workflow updates
  const subscribeToWorkflow = useCallback((wfId: string) => {
    if (!wfId) return;
    
    console.log(`Setting up realtime subscription for workflow: ${wfId}`);
    
    try {
      const channel = supabase
        .channel(`workflow-${wfId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'workflows',
            filter: `id=eq.${wfId}`
          },
          (payload) => {
            console.log('Received workflow update:', payload);
            const updatedWorkflow = payload.new;
            
            if (updatedWorkflow.last_run_status) {
              // Convert to string to avoid type errors
              const newStatus = String(updatedWorkflow.last_run_status);
              setStatus(newStatus);
              
              // Call the onStatusChange callback
              if (onStatusChange) {
                onStatusChange(newStatus);
              }
            }
          }
        )
        .subscribe();
      
      channelsRef.current.push(channel);
      return channel;
    } catch (error) {
      console.error('Error setting up workflow subscription:', error);
      return null;
    }
  }, [onStatusChange]);

  // Subscribe to updates when IDs change
  useEffect(() => {
    // Clean up existing subscriptions
    cleanupSubscriptions();
    
    // Set up new subscriptions if we have IDs
    if (executionId) {
      subscribeToExecution(executionId);
    }
    
    if (workflowId) {
      subscribeToWorkflow(workflowId);
    }
    
    // Clean up on unmount or when IDs change
    return () => {
      cleanupSubscriptions();
    };
  }, [executionId, workflowId, cleanupSubscriptions, subscribeToExecution, subscribeToWorkflow]);

  return {
    status,
    subscriptionStatus,
    cleanupSubscriptions
  };
}
