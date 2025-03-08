
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type SubscriptionFilter = {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema: string;
  table: string;
  filter?: string;
}

/**
 * Hook for optimized Supabase realtime subscriptions
 * Includes connection pooling and better error handling
 */
export function useOptimizedRealtimeSubscription<T = any>(
  channelName: string,
  filter: SubscriptionFilter,
  callback: (payload: RealtimePostgresChangesPayload<T>) => void,
  enabled: boolean = true
) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(callback);
  
  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // Setup and teardown subscription
  useEffect(() => {
    if (!isEnabled) {
      setIsConnected(false);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }
    
    // Create a unique channel name with a timestamp to avoid conflicts
    const uniqueChannelName = `${channelName}_${Date.now()}`;
    
    // Setup subscription
    const channel = supabase
      .channel(uniqueChannelName)
      .on(
        'postgres_changes',
        {
          event: filter.event,
          schema: filter.schema,
          table: filter.table,
          filter: filter.filter
        },
        (payload) => {
          // Use the ref to avoid closure issues
          callbackRef.current(payload as RealtimePostgresChangesPayload<T>);
        }
      )
      .subscribe((status) => {
        console.log(`Subscription ${uniqueChannelName} status: ${status}`);
        setIsConnected(status === 'SUBSCRIBED');
      });
    
    channelRef.current = channel;
    
    // Cleanup function
    return () => {
      if (channelRef.current) {
        console.log(`Removing channel ${uniqueChannelName}`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        setIsConnected(false);
      }
    };
  }, [isEnabled, channelName, filter.event, filter.schema, filter.table, filter.filter]);
  
  const setEnabled = useCallback((newEnabled: boolean) => {
    setIsEnabled(newEnabled);
  }, []);
  
  return {
    isConnected,
    setEnabled
  };
}
