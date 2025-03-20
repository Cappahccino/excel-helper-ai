
import { useState, useEffect, useCallback, useRef } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { supabase } from '@/integrations/supabase/client';
import { getSchemaFromCache, getSchemaMetadataFromCache, cacheSchema, invalidateSchemaCache } from '@/utils/schema';
import { SchemaSubscriptionOptions, SchemaMetadata, SchemaUpdateEvent } from '@/utils/schema/types';

/**
 * Hook for subscribing to schema updates
 * Uses Redis channels for realtime updates and polling as a fallback
 */
export function useSchemaSubscription(
  workflowId: string | null,
  nodeId: string,
  options: SchemaSubscriptionOptions = {}
) {
  const {
    sheetName,
    pollingInterval = 10000, // Default 10 seconds
    onSchemaUpdated,
    debug = false
  } = options;
  
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const supabaseChannelRef = useRef<any>(null);
  const schemaVersionRef = useRef<number>(0);
  
  const debugLog = useCallback((message: string, data?: any) => {
    if (debug) {
      console.log(`[SchemaSubscription] ${message}`, data);
    }
  }, [debug]);
  
  // Function to refresh schema from database or edge function
  const refreshSchema = useCallback(async () => {
    if (!workflowId || !nodeId) return;
    
    try {
      debugLog(`Refreshing schema for ${nodeId}`);
      
      // First try to get from cache
      const cachedMetadata = await getSchemaMetadataFromCache(workflowId, nodeId, {
        sheetName,
        maxAge: 30000 // 30 seconds
      });
      
      if (cachedMetadata) {
        schemaVersionRef.current = cachedMetadata.version || 0;
        debugLog(`Using cached schema with version ${schemaVersionRef.current}`);
        
        if (onSchemaUpdated) {
          onSchemaUpdated(cachedMetadata.schema, cachedMetadata);
        }
        
        setLastUpdate(Date.now());
        return;
      }
      
      // Call Edge Function to get current schema
      const { data, error } = await supabase.functions.invoke('schemaPropagation', {
        body: {
          action: 'getSchema',
          workflowId,
          nodeId,
          sheetName
        }
      });
      
      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
      }
      
      if (data?.schema) {
        const schema = data.schema;
        const version = data.version || 0;
        
        // Only update if version is newer
        if (version > schemaVersionRef.current) {
          schemaVersionRef.current = version;
          
          // Cache the schema
          await cacheSchema(workflowId, nodeId, schema, {
            source: "subscription",
            version,
            sheetName
          });
          
          if (onSchemaUpdated) {
            onSchemaUpdated(schema, {
              schema,
              source: "subscription",
              version,
              sheetName
            });
          }
        }
        
        setLastUpdate(Date.now());
      }
    } catch (err) {
      debugLog(`Error refreshing schema: ${err instanceof Error ? err.message : String(err)}`);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [workflowId, nodeId, sheetName, onSchemaUpdated, debugLog]);
  
  // Setup Supabase realtime subscription for schema updates
  const setupSubscription = useCallback(() => {
    if (!workflowId || !nodeId) return;
    
    try {
      // First clean up any existing subscription
      if (supabaseChannelRef.current) {
        supabase.removeChannel(supabaseChannelRef.current);
        supabaseChannelRef.current = null;
      }
      
      const dbWorkflowId = workflowId.startsWith('temp-') 
        ? workflowId.substring(5) 
        : workflowId;
      
      const channelName = `schema_updates:${dbWorkflowId}:${nodeId}`;
      debugLog(`Setting up subscription to ${channelName}`);
      
      const channel = supabase.channel(channelName);
      
      (channel as any).on(
        'broadcast',
        { event: 'schema_update' },
        async (payload: { payload: SchemaUpdateEvent }) => {
          if (!payload.payload) return;
          
          const eventData = payload.payload;
          debugLog(`Received schema update event for ${eventData.nodeId}`, eventData);
          
          // Make sure it's for our node
          if (eventData.nodeId !== nodeId) return;
          
          // Make sure sheet matches if specified
          if (sheetName && eventData.sheetName && eventData.sheetName !== sheetName) return;
          
          // Check version to avoid processing outdated updates
          if (eventData.version && eventData.version <= schemaVersionRef.current) {
            debugLog(`Ignoring outdated schema version ${eventData.version} (current: ${schemaVersionRef.current})`);
            return;
          }
          
          // Update our version reference
          if (eventData.version) {
            schemaVersionRef.current = eventData.version;
          }
          
          // Cache the schema
          await cacheSchema(workflowId, nodeId, eventData.schema, {
            source: eventData.source,
            version: eventData.version,
            sheetName: eventData.sheetName
          });
          
          // Notify via callback
          if (onSchemaUpdated) {
            onSchemaUpdated(eventData.schema, {
              schema: eventData.schema,
              source: eventData.source,
              version: eventData.version,
              sheetName: eventData.sheetName
            });
          }
          
          setLastUpdate(Date.now());
        }
      ).subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          debugLog(`Successfully subscribed to schema updates for ${nodeId}`);
          setIsSubscribed(true);
          setError(null);
        } else if (status === 'CHANNEL_ERROR') {
          debugLog(`Error subscribing to schema updates: ${status}`);
          setIsSubscribed(false);
          setError(new Error(`Channel error: ${status}`));
        } else if (status === 'CLOSED') {
          debugLog(`Subscription closed for ${nodeId}`);
          setIsSubscribed(false);
        }
      });
      
      supabaseChannelRef.current = channel;
    } catch (err) {
      debugLog(`Error setting up subscription: ${err instanceof Error ? err.message : String(err)}`);
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsSubscribed(false);
    }
  }, [workflowId, nodeId, sheetName, onSchemaUpdated, debugLog]);
  
  // Set up polling as a fallback mechanism
  const setupPolling = useCallback(() => {
    // Clear any existing polling
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    
    // Skip if no workflow or node
    if (!workflowId || !nodeId || pollingInterval <= 0) {
      setIsPolling(false);
      return;
    }
    
    const poll = async () => {
      await refreshSchema();
      
      // Schedule next poll
      pollingTimeoutRef.current = setTimeout(poll, pollingInterval);
    };
    
    // Start polling
    setIsPolling(true);
    poll();
  }, [workflowId, nodeId, pollingInterval, refreshSchema]);
  
  // Set up subscription and initial poll on mount
  useEffect(() => {
    if (workflowId && nodeId) {
      // Set up subscription first
      setupSubscription();
      
      // Always do one initial refresh
      refreshSchema();
      
      // Set up polling as a fallback
      setupPolling();
    }
    
    return () => {
      // Clean up subscription
      if (supabaseChannelRef.current) {
        supabase.removeChannel(supabaseChannelRef.current);
        supabaseChannelRef.current = null;
      }
      
      // Clean up polling
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
      
      setIsSubscribed(false);
      setIsPolling(false);
    };
  }, [workflowId, nodeId, sheetName, setupSubscription, setupPolling, refreshSchema]);
  
  return {
    isSubscribed,
    isPolling,
    lastUpdate,
    error,
    refreshSchema
  };
}
