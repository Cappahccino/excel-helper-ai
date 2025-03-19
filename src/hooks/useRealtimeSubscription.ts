
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { trackSubscription } from '@/utils/schemaPropagationScheduler';

type RealtimeSubscriptionOptions = {
  table: string;
  schema?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  channelName?: string;
  workflowId?: string;
  nodeId?: string;
  reconnectTimeout?: number;
  maxReconnectAttempts?: number;
};

export function useRealtimeSubscription<T>(
  options: RealtimeSubscriptionOptions,
  callback: (payload: any) => void,
  enabled: boolean = true
) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const channelRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const {
    reconnectTimeout = 3000,
    maxReconnectAttempts = 3,
    workflowId,
    nodeId
  } = options;

  // Generate a stable channel name
  const getChannelName = useCallback(() => {
    if (options.channelName) return options.channelName;
    const baseName = `${options.schema || 'public'}-${options.table}-changes`;
    if (options.filter) {
      return `${baseName}-${options.filter.replace(/[^a-zA-Z0-9]/g, '')}`;
    }
    return baseName;
  }, [options.channelName, options.schema, options.table, options.filter]);

  // Setup subscription with reconnect logic
  const setupSubscription = useCallback(() => {
    if (!enabled) return;
    
    // Clean up existing channel if any
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch (err) {
        console.error('Error removing existing channel:', err);
      }
      channelRef.current = null;
    }
    
    try {
      const channelName = getChannelName();
      console.log(`Setting up channel: ${channelName}`);
      
      const channel = supabase
        .channel(channelName)
        .on('postgres_changes' as any, 
          {
            event: options.event || '*',
            schema: options.schema || 'public',
            table: options.table,
            filter: options.filter
          },
          (payload) => {
            callback(payload);
          }
        )
        .subscribe((status) => {
          const isNowSubscribed = status === 'SUBSCRIBED';
          setIsSubscribed(isNowSubscribed);
          
          // Track subscription state if workflowId and nodeId are provided
          if (workflowId && nodeId) {
            trackSubscription(
              workflowId, 
              nodeId, 
              isNowSubscribed, 
              status === 'CHANNEL_ERROR'
            );
          }
          
          if (isNowSubscribed) {
            console.log(`Successfully subscribed to ${channelName}`);
            setReconnectAttempts(0);
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.warn(`Subscription to ${channelName} ${status}, attempt ${reconnectAttempts + 1}`);
            
            // Try to reconnect if within max attempts
            if (reconnectAttempts < maxReconnectAttempts) {
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
              }
              
              timeoutRef.current = setTimeout(() => {
                setReconnectAttempts(prev => prev + 1);
                setupSubscription();
              }, reconnectTimeout);
            }
          }
        });

      channelRef.current = channel;
    } catch (err) {
      console.error('Error setting up subscription:', err);
      
      // Track failed subscription if workflowId and nodeId are provided
      if (workflowId && nodeId) {
        trackSubscription(workflowId, nodeId, false, true);
      }
    }
  }, [
    enabled, 
    getChannelName, 
    options.event, 
    options.schema, 
    options.table, 
    options.filter, 
    callback, 
    reconnectAttempts, 
    maxReconnectAttempts, 
    reconnectTimeout,
    workflowId,
    nodeId
  ]);

  useEffect(() => {
    setupSubscription();

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (channelRef.current) {
        try {
          console.log(`Cleaning up subscription to ${getChannelName()}`);
          supabase.removeChannel(channelRef.current);
        } catch (err) {
          console.error('Error removing channel during cleanup:', err);
        }
        channelRef.current = null;
      }
      
      // Mark subscription as inactive during cleanup
      if (workflowId && nodeId) {
        trackSubscription(workflowId, nodeId, false);
      }
    };
  }, [setupSubscription, getChannelName, workflowId, nodeId]);

  // Force reconnect method
  const reconnect = useCallback(() => {
    setReconnectAttempts(0);
    setupSubscription();
  }, [setupSubscription]);

  return { 
    isSubscribed, 
    reconnect,
    reconnectAttempts,
    hasReachedMaxRetries: reconnectAttempts >= maxReconnectAttempts 
  };
}
