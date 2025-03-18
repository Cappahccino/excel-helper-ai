import { useState, useEffect, useCallback } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { supabase } from '@/integrations/supabase/client';
import { cacheSchema, getSchemaFromCache } from '@/utils/schema';

interface SchemaSubscriptionOptions {
  /**
   * How often to check for updates if the real-time channel is not available
   */
  pollingInterval?: number;
  
  /**
   * Whether to show debug logs
   */
  debug?: boolean;
  
  /**
   * Function to call when schema is updated
   */
  onSchemaUpdated?: (schema: SchemaColumn[], meta: { source: string; version?: number }) => void;
  
  /**
   * Whether to show toast notifications on updates
   */
  showNotifications?: boolean;
}

/**
 * Hook for subscribing to schema updates via Redis Pub/Sub through Edge Function
 */
export function useSchemaSubscription(
  workflowId: string | null,
  nodeId: string | null,
  options: SchemaSubscriptionOptions = {}
) {
  const {
    pollingInterval = 5000,
    debug = false,
    onSchemaUpdated,
    showNotifications = false
  } = options;
  
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<{
    timestamp: number;
    version?: number;
    source?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Debug logger
  const logDebug = useCallback((message: string, ...args: any[]) => {
    if (debug) {
      console.log(`[SchemaSubscription] ${message}`, ...args);
    }
  }, [debug]);
  
  // Handle schema update from any source
  const handleSchemaUpdate = useCallback(async (
    source: string, 
    version?: number
  ) => {
    if (!workflowId || !nodeId) return;
    
    try {
      // Get updated schema from cache or Edge Function
      const schema = await getSchemaFromCache(workflowId, nodeId);
      
      if (schema) {
        logDebug(`Schema updated from ${source}, version: ${version || 'unknown'}`);
        
        setLastUpdate({
          timestamp: Date.now(),
          version,
          source
        });
        
        if (onSchemaUpdated) {
          onSchemaUpdated(schema, { source, version });
        }
      }
    } catch (error) {
      logDebug('Error handling schema update:', error);
      setError(`Failed to process schema update: ${error.message}`);
    }
  }, [workflowId, nodeId, onSchemaUpdated, logDebug]);
  
  // Subscribe to real-time updates via Edge Function
  useEffect(() => {
    if (!workflowId || !nodeId) return;
    
    logDebug(`Setting up subscription for node ${nodeId} in workflow ${workflowId}`);
    setIsSubscribed(false);
    setError(null);
    
    const setupChannel = async () => {
      try {
        // Check Redis connection status via Edge Function
        const { data, error } = await supabase.functions.invoke('schemaPropagation', {
          body: {
            action: 'subscribeToSchemaUpdates',
            workflowId,
            nodeId
          }
        });
        
        if (error) {
          throw new Error(error.message);
        }
        
        if (data?.subscribed) {
          logDebug('Subscription established via Edge Function');
          setIsSubscribed(true);
          
          // If there's an initial schema, process it
          if (data.schema) {
            await cacheSchema(workflowId, nodeId, data.schema, {
              source: "subscription",
              version: data.version
            });
            
            handleSchemaUpdate('subscription', data.version);
          }
        } else {
          logDebug('Falling back to polling for schema updates');
          setIsSubscribed(false);
        }
      } catch (error) {
        logDebug('Error setting up subscription:', error);
        setError(`Failed to subscribe: ${error.message}`);
        setIsSubscribed(false);
      }
    };
    
    setupChannel();
    
    // Set up polling as a fallback mechanism
    const pollInterval = setInterval(async () => {
      if (isSubscribed) return; // No need to poll if subscribed
      
      try {
        // Check for updates via Edge Function
        const { data, error } = await supabase.functions.invoke('schemaPropagation', {
          body: {
            action: 'checkForSchemaUpdates',
            workflowId,
            nodeId,
            lastVersion: lastUpdate?.version
          }
        });
        
        if (error) {
          logDebug('Error polling for updates:', error);
          return;
        }
        
        if (data?.hasUpdates && data.schema) {
          logDebug('Update found via polling, version:', data.version);
          
          // Cache the updated schema
          await cacheSchema(workflowId, nodeId, data.schema, {
            source: "polling",
            version: data.version
          });
          
          handleSchemaUpdate('polling', data.version);
        }
      } catch (error) {
        logDebug('Error in polling interval:', error);
      }
    }, pollingInterval);
    
    return () => {
      clearInterval(pollInterval);
      
      // Unsubscribe via Edge Function
      if (isSubscribed) {
        supabase.functions.invoke('schemaPropagation', {
          body: {
            action: 'unsubscribeFromSchemaUpdates',
            workflowId,
            nodeId
          }
        }).catch(error => {
          logDebug('Error unsubscribing:', error);
        });
      }
    };
  }, [workflowId, nodeId, isSubscribed, lastUpdate, handleSchemaUpdate, pollingInterval, logDebug]);
  
  // Force refresh from the Edge Function
  const refreshSchema = useCallback(async (): Promise<boolean> => {
    if (!workflowId || !nodeId) return false;
    
    try {
      logDebug('Manually refreshing schema');
      
      const { data, error } = await supabase.functions.invoke('schemaPropagation', {
        body: {
          action: 'refreshSchema',
          workflowId,
          nodeId
        }
      });
      
      if (error) {
        setError(`Failed to refresh schema: ${error.message}`);
        return false;
      }
      
      if (data?.schema) {
        // Cache the updated schema
        await cacheSchema(workflowId, nodeId, data.schema, {
          source: "manual_refresh",
          version: data.version
        });
        
        handleSchemaUpdate('manual_refresh', data.version);
        return true;
      }
      
      return false;
    } catch (error) {
      logDebug('Error in refreshSchema:', error);
      setError(`Failed to refresh schema: ${error.message}`);
      return false;
    }
  }, [workflowId, nodeId, handleSchemaUpdate, logDebug]);
  
  return {
    isSubscribed,
    lastUpdate,
    error,
    refreshSchema
  };
}
