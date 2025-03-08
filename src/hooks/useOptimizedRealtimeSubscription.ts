
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from './useDebounce';
import { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeSubscriptionOptions {
  table: string;
  schema?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  filterValue?: string | number;
  enabled?: boolean;
  column?: string;
  throttleMs?: number;
}

export function useOptimizedRealtimeSubscription<T = any>({
  table,
  schema = 'public',
  event = '*',
  filter,
  filterValue,
  column = 'id',
  enabled = true,
  throttleMs = 300
}: UseRealtimeSubscriptionOptions) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<'idle' | 'subscribed' | 'error'>('idle');
  const lastUpdateTime = useRef<number>(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const debouncedFilter = useDebounce(filter, throttleMs);
  const debouncedValue = useDebounce(filterValue, throttleMs);

  useEffect(() => {
    if (!enabled) return;

    const filterCondition = debouncedFilter && debouncedValue
      ? `${debouncedFilter}=eq.${debouncedValue}`
      : undefined;

    let channelName = `${table}_${event}_${Math.random().toString(36).substring(2, 9)}`;
    if (filterCondition) channelName += `_${filterCondition}`;

    try {
      // Create the channel and subscribe to PostgreSQL changes
      const channel = supabase.channel(channelName);
      
      // Add the subscription to PostgreSQL changes
      // Using type assertion to work around TypeScript error
      (channel as any).on(
        'postgres_changes',
        {
          event: event,
          schema: schema,
          table: table,
          filter: filterCondition,
        },
        (payload: any) => {
          const now = Date.now();
          // Throttle updates to avoid rapid re-renders
          if (now - lastUpdateTime.current > throttleMs) {
            setData(payload.new as T);
            lastUpdateTime.current = now;
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setStatus('subscribed');
        } else if (status === 'CHANNEL_ERROR') {
          setStatus('error');
          setError(new Error('Failed to subscribe to realtime changes'));
        }
      });

      channelRef.current = channel;
    } catch (err) {
      console.error('Error setting up realtime subscription:', err);
      setError(err instanceof Error ? err : new Error('Unknown error in realtime subscription'));
      setStatus('error');
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [
    enabled,
    table,
    schema,
    event,
    debouncedFilter,
    debouncedValue,
    throttleMs,
    column
  ]);

  return { data, error, status };
}
