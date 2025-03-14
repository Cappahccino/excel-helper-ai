
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Custom hook for subscribing to schema changes in real-time
 */
export function useSchemaSubscription({
  workflowId,
  nodeId,
  sheetName,
  enabled = true,
  onSchemaChange
}: {
  workflowId: string | null;
  nodeId: string;
  sheetName?: string;
  enabled?: boolean;
  onSchemaChange?: () => void;
}) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!workflowId || !nodeId || !enabled) return;
    
    // Convert temporary workflow ID if needed
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
      
    const effectiveSheetName = sheetName || 'default';
    
    console.log(`Setting up schema subscription for ${nodeId}, sheet: ${effectiveSheetName}`);
    
    let channel: RealtimeChannel;
    
    try {
      // Build filter based on whether we have a sheet name
      const baseFilter = `workflow_id=eq.${dbWorkflowId} AND node_id=eq.${nodeId}`;
      const filter = sheetName 
        ? `${baseFilter} AND sheet_name=eq.${effectiveSheetName}`
        : baseFilter;
      
      channel = supabase
        .channel(`schema_sub_${nodeId}_${effectiveSheetName}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'workflow_file_schemas',
            filter
          },
          (payload) => {
            console.log(`Schema update received for ${nodeId}, sheet: ${effectiveSheetName}`);
            
            if (onSchemaChange) {
              onSchemaChange();
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'workflow_file_schemas',
            filter
          },
          (payload) => {
            console.log(`New schema inserted for ${nodeId}, sheet: ${effectiveSheetName}`);
            
            if (onSchemaChange) {
              onSchemaChange();
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`Successfully subscribed to schema changes for ${nodeId}`);
            setIsSubscribed(true);
            setSubscriptionError(null);
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`Error subscribing to schema changes for ${nodeId}`);
            setIsSubscribed(false);
            setSubscriptionError('Failed to subscribe to schema changes');
          }
        });
    } catch (error) {
      console.error('Error setting up schema subscription:', error);
      setSubscriptionError(error instanceof Error ? error.message : 'Unknown error');
      setIsSubscribed(false);
    }
    
    return () => {
      if (channel) {
        console.log(`Cleaning up schema subscription for ${nodeId}`);
        supabase.removeChannel(channel);
      }
    };
  }, [workflowId, nodeId, sheetName, enabled, onSchemaChange]);
  
  return {
    isSubscribed,
    subscriptionError
  };
}
