
import { useState, useEffect, useCallback, useRef } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { useSchemaSubscription } from './useSchemaSubscription';
import { getSchemaFromCache, invalidateSchemaCache } from '@/utils/schema';
import { supabase } from '@/integrations/supabase/client';

/**
 * Connection state enum to track the schema connection status
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

/**
 * Options for the useSchemaConnection hook
 */
export interface SchemaConnectionOptions {
  debug?: boolean;
  autoConnect?: boolean;
  showNotifications?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  sheetName?: string;
}

/**
 * Hook for managing schema connections between nodes
 * Combines subscription and caching to provide a reliable schema connection
 */
export function useSchemaConnection(
  workflowId: string | null,
  nodeId: string,
  sourceNodeId: string | null,
  options: SchemaConnectionOptions = {}
) {
  const {
    debug = false,
    autoConnect = true,
    showNotifications = false,
    maxRetries = 3,
    retryDelay = 1000,
    sheetName
  } = options;
  
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSourceNode, setHasSourceNode] = useState<boolean>(!!sourceNodeId);
  const [retryCount, setRetryCount] = useState(0);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const connectionAttemptRef = useRef<boolean>(false);

  const debugLog = useCallback((message: string, data?: any) => {
    if (debug) {
      console.log(`[SchemaConnection] ${message}`, data);
    }
  }, [debug]);
  
  // Function to refresh schema from cache or subscription
  const refreshSchema = useCallback(async () => {
    if (!workflowId || !nodeId || !sourceNodeId) {
      setConnectionState(ConnectionState.DISCONNECTED);
      return false;
    }
    
    try {
      debugLog(`Refreshing schema from source ${sourceNodeId}`);
      setConnectionState(ConnectionState.CONNECTING);
      
      // First try to get from cache
      const cachedSchema = await getSchemaFromCache(workflowId, nodeId, {
        sheetName,
        maxAge: 30000 // 30 seconds
      });
      
      if (cachedSchema && cachedSchema.length > 0) {
        debugLog(`Using cached schema with ${cachedSchema.length} columns`);
        setSchema(cachedSchema);
        setError(null);
        setConnectionState(ConnectionState.CONNECTED);
        setLastRefreshTime(new Date());
        return true;
      }
      
      // If not in cache, try to get from source node's cache
      const sourceSchema = await getSchemaFromCache(workflowId, sourceNodeId, {
        sheetName,
        maxAge: 60000 // 1 minute
      });
      
      if (sourceSchema && sourceSchema.length > 0) {
        debugLog(`Using source node's cached schema with ${sourceSchema.length} columns`);
        setSchema(sourceSchema);
        setError(null);
        setConnectionState(ConnectionState.CONNECTED);
        setLastRefreshTime(new Date());
        
        // Cache locally
        invalidateSchemaCache(workflowId, nodeId);
        
        // Call Edge Function to propagate
        const { error } = await supabase.functions.invoke('schemaPropagation', {
          body: {
            action: 'propagate',
            workflowId,
            sourceNodeId,
            targetNodeId: nodeId,
            sheetName
          }
        });
        
        if (error) {
          debugLog(`Edge function propagation error: ${error.message}`);
        }
        
        return true;
      }
      
      // If not in source cache either, call edge function for full refresh
      const { data, error } = await supabase.functions.invoke('schemaPropagation', {
        body: {
          action: 'getSchema',
          workflowId,
          nodeId: sourceNodeId,
          sheetName
        }
      });
      
      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
      }
      
      if (data?.schema && Array.isArray(data.schema)) {
        debugLog(`Got schema from edge function with ${data.schema.length} columns`);
        setSchema(data.schema);
        setError(null);
        setConnectionState(ConnectionState.CONNECTED);
        setLastRefreshTime(new Date());
        return true;
      } else {
        throw new Error("Invalid schema data from edge function");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      debugLog(`Error refreshing schema: ${errorMessage}`);
      setError(errorMessage);
      setConnectionState(ConnectionState.ERROR);
      
      // Retry logic
      if (retryCount < maxRetries) {
        debugLog(`Retry ${retryCount + 1}/${maxRetries} in ${retryDelay}ms`);
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          refreshSchema();
        }, retryDelay * Math.pow(2, retryCount)); // Exponential backoff
      }
      
      return false;
    }
  }, [workflowId, nodeId, sourceNodeId, sheetName, maxRetries, retryDelay, retryCount, debugLog]);
  
  // Setup schema subscription when the source node is available
  const { isSubscribed, refreshSchema: subscriptionRefresh, lastUpdate } = useSchemaSubscription(
    workflowId,
    nodeId,
    {
      sheetName,
      pollingInterval: 15000,
      onSchemaUpdated: (updatedSchema, metadata) => {
        debugLog(`Schema updated via subscription: ${metadata.source}`);
        setSchema(updatedSchema);
        setError(null);
        setConnectionState(ConnectionState.CONNECTED);
        setLastRefreshTime(new Date());
      },
      debug
    }
  );
  
  // Check if source node exists
  useEffect(() => {
    // Only run this check once per component instance
    if (connectionAttemptRef.current) return;
    
    const checkSourceNode = async () => {
      if (!workflowId || !nodeId) return;
      
      try {
        if (sourceNodeId) {
          debugLog(`Source node ID provided: ${sourceNodeId}`);
          setHasSourceNode(true);
          
          // Refresh schema if auto-connect is true
          if (autoConnect) {
            refreshSchema();
          }
        } else {
          debugLog('No source node ID provided, checking for connections');
          
          // Check if there are any incoming connections
          const dbWorkflowId = workflowId.startsWith('temp-') 
            ? workflowId.substring(5) 
            : workflowId;
            
          const { data, error } = await supabase
            .from('workflow_edges')
            .select('source_node_id')
            .eq('workflow_id', dbWorkflowId)
            .eq('target_node_id', nodeId)
            .maybeSingle();
            
          if (error) {
            debugLog(`Error checking connections: ${error.message}`);
            return;
          }
          
          if (data?.source_node_id) {
            debugLog(`Found source node in database: ${data.source_node_id}`);
            setHasSourceNode(true);
          } else {
            debugLog('No source node found');
            setHasSourceNode(false);
            setConnectionState(ConnectionState.DISCONNECTED);
          }
        }
      } catch (error) {
        debugLog(`Error in checkSourceNode: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Mark that we've attempted connection
      connectionAttemptRef.current = true;
    };
    
    checkSourceNode();
  }, [workflowId, nodeId, sourceNodeId, autoConnect, refreshSchema, debugLog]);
  
  // Set up subscription-based refresh when isSubscribed changes
  useEffect(() => {
    if (isSubscribed && schema.length === 0 && hasSourceNode) {
      debugLog('Subscription active but no schema yet, refreshing');
      subscriptionRefresh();
    }
  }, [isSubscribed, schema.length, hasSourceNode, subscriptionRefresh, debugLog]);
  
  // Update lastRefreshTime when lastUpdate changes
  useEffect(() => {
    if (lastUpdate) {
      setLastRefreshTime(new Date(lastUpdate));
    }
  }, [lastUpdate]);
  
  const isLoading = connectionState === ConnectionState.CONNECTING;
  
  return {
    connectionState,
    schema,
    isLoading,
    error,
    lastRefreshTime,
    refreshSchema,
    hasSourceNode,
    isSubscribed,
    sheetName
  };
}
