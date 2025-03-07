
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

type RealtimeSubscriptionOptions = {
  table: string;
  schema?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
};

export function useRealtimeSubscription<T>(
  options: RealtimeSubscriptionOptions,
  callback: (payload: any) => void,
  enabled: boolean = true
) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Setup channel
    const channel = supabase
      .channel('table-db-changes')
      .on(
        'postgres_changes', // This is a valid string literal for the supabase-js channel method
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
        setIsSubscribed(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    // Cleanup function
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [options.table, options.schema, options.event, options.filter, callback, enabled]);

  return { isSubscribed };
}
