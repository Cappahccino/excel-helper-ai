
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
      // In Supabase JS v2, we need to cast this as any because the TypeScript types 
      // are stricter than the actual implementation allows
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
