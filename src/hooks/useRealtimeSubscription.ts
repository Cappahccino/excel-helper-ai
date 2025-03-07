
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeSubscriptionOptions {
  schema?: string;
  table: string;
  event?: RealtimeEvent;
  filter?: string;
  callback: (payload: any) => void;
}

/**
 * Hook to subscribe to real-time changes in Supabase tables
 */
export function useRealtimeSubscription({
  schema = 'public',
  table,
  event = '*',
  filter,
  callback
}: UseRealtimeSubscriptionOptions) {
  useEffect(() => {
    // Create a subscription configuration
    const config = {
      schema,
      table,
      event,
      filter
    };

    console.log(`Setting up realtime subscription for ${schema}.${table} (${event})`);
    
    // Create the channel
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', config, callback)
      .subscribe((status) => {
        console.log(`Subscription status for ${table}: ${status}`);
      });

    // Clean up subscription when the component unmounts
    return () => {
      console.log(`Cleaning up realtime subscription for ${schema}.${table}`);
      supabase.removeChannel(channel);
    };
  }, [schema, table, event, filter, callback]);
}
