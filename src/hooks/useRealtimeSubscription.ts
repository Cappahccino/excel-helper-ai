
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { trackSubscription } from '@/utils/schemaPropagationScheduler';

type SubscriptionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';

// Define proper types for Supabase realtime events and filters
type RealtimePostgresChangesPayload<T> = {
  commit_timestamp: string;
  errors: any;
  schema: string;
  table: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  old: T;
  new: T;
};

type PostgresChangesFilter = {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema: string;
  table: string;
  filter?: string;
};

interface UseRealtimeSubscriptionOptions {
  table: string;
  schema?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  enabled?: boolean;
  debugName?: string;
  channelName?: string;
  onRecordChange?: (payload: RealtimePostgresChangesPayload<any>) => void;
  onStatusChange?: (status: SubscriptionStatus) => void;
  workflowId?: string;
  nodeId?: string;
  maxRetries?: number;
  retryDelay?: number;
}

export function useRealtimeSubscription({
  table,
  schema = 'public',
  event = '*',
  filter,
  enabled = true,
  debugName = 'subscription',
  channelName,
  onRecordChange,
  onStatusChange,
  workflowId,
  nodeId,
  maxRetries = 3,
  retryDelay = 1000
}: UseRealtimeSubscriptionOptions) {
  const [status, setStatus] = useState<SubscriptionStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const channelRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  // Update status and notify via callback if provided
  const updateStatus = useCallback((newStatus: SubscriptionStatus, error?: Error) => {
    if (!isMounted.current) return;
    
    setStatus(newStatus);
    if (error) setError(error);
    
    if (onStatusChange) {
      onStatusChange(newStatus);
    }
    
    // Track subscription state if workflowId and nodeId are provided
    if (workflowId && nodeId) {
      trackSubscription(
        workflowId, 
        nodeId, 
        newStatus === 'connected', 
        newStatus === 'error'
      );
    }
  }, [onStatusChange, workflowId, nodeId]);

  // Set up the subscription with robust error handling
  const setupSubscription = useCallback(() => {
    if (!enabled) return;
    
    // Clean up existing channel if any
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch (err) {
        console.error(`[${debugName}] Error removing existing channel:`, err);
      }
      channelRef.current = null;
    }
    
    // Generate a unique channel name if not provided
    const actualChannelName = channelName || 
      `${table}_${event}_${Math.random().toString(36).substring(2, 10)}`;
    
    console.log(`[${debugName}] Setting up subscription to ${table}`, { filter });
    updateStatus('connecting');
    
    try {
      const channel = supabase.channel(actualChannelName);
      
      // Create the filter object with proper typing
      const postgresFilter: PostgresChangesFilter = {
        event: event,
        schema: schema,
        table: table
      };
      
      // Add filter if provided
      if (filter) {
        postgresFilter.filter = filter;
      }
      
      channel.on(
        'postgres_changes',
        postgresFilter,
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (!isMounted.current) return;
          
          console.log(`[${debugName}] Received update:`, payload);
          
          if (onRecordChange) {
            onRecordChange(payload);
          }
        }
      ).subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[${debugName}] Successfully subscribed to ${table}`);
          updateStatus('connected');
          setRetryCount(0);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[${debugName}] Error subscribing to ${table}:`, status);
          updateStatus('error', new Error(`Channel error for ${table}`));
          scheduleReconnect();
        } else if (status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[${debugName}] Subscription to ${table} ${status.toLowerCase()}`);
          updateStatus('closed', new Error(`Channel ${status.toLowerCase()} for ${table}`));
          scheduleReconnect();
        }
      });
      
      channelRef.current = channel;
    } catch (err) {
      console.error(`[${debugName}] Error setting up subscription:`, err);
      updateStatus('error', err instanceof Error ? err : new Error(String(err)));
      scheduleReconnect();
    }
  }, [
    enabled, table, schema, event, filter, channelName, debugName, 
    onRecordChange, updateStatus
  ]);
  
  // Schedule a reconnection attempt with exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (!isMounted.current || retryCount >= maxRetries) return;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Calculate backoff delay with exponential increase
    const delay = retryDelay * Math.pow(2, retryCount);
    
    console.log(`[${debugName}] Scheduling reconnection attempt ${retryCount + 1}/${maxRetries} in ${delay}ms`);
    
    timeoutRef.current = setTimeout(() => {
      if (!isMounted.current) return;
      
      setRetryCount(prev => prev + 1);
      setupSubscription();
    }, delay);
  }, [retryCount, maxRetries, retryDelay, debugName, setupSubscription]);
  
  // Force a reconnection
  const reconnect = useCallback(() => {
    setRetryCount(0);
    setupSubscription();
  }, [setupSubscription]);

  // Set up subscription on mount and when dependencies change
  useEffect(() => {
    isMounted.current = true;
    setupSubscription();
    
    // Clean up on unmount or when dependencies change
    return () => {
      isMounted.current = false;
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (channelRef.current) {
        try {
          console.log(`[${debugName}] Cleaning up subscription to ${table}`);
          
          // Try to unsubscribe first
          channelRef.current.unsubscribe().then(() => {
            try {
              supabase.removeChannel(channelRef.current);
            } catch (err) {
              console.error(`[${debugName}] Error removing channel during cleanup:`, err);
            }
            channelRef.current = null;
          }).catch((err: any) => {
            console.error(`[${debugName}] Error unsubscribing:`, err);
            // Still try to remove the channel
            try {
              supabase.removeChannel(channelRef.current);
            } catch (innerErr) {
              console.error(`[${debugName}] Error removing channel after unsubscribe failure:`, innerErr);
            }
            channelRef.current = null;
          });
        } catch (err) {
          console.error(`[${debugName}] Exception during cleanup:`, err);
          // Final attempt to clean up
          try {
            supabase.removeChannel(channelRef.current);
          } catch (finalErr) {
            console.error(`[${debugName}] Final error removing channel:`, finalErr);
          }
          channelRef.current = null;
        }
      }
      
      // Mark subscription as inactive during cleanup
      if (workflowId && nodeId) {
        trackSubscription(workflowId, nodeId, false);
      }
    };
  }, [
    table, schema, event, filter, enabled, debugName, setupSubscription,
    workflowId, nodeId
  ]);

  return { 
    status, 
    error, 
    reconnect, 
    retryCount,
    hasReachedMaxRetries: retryCount >= maxRetries 
  };
}
