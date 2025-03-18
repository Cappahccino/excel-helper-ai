
import { useState, useEffect, useCallback } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { supabase } from '@/integrations/supabase/client';
import { cacheSchema, getSchemaFromCache, invalidateSchemaCache } from '@/utils/schemaCache';
import { getSchemaForFiltering } from '@/utils/schemaPropagation';
import { toast } from 'sonner';

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

/**
 * Hook for connecting to and managing schema for a node
 * Especially useful for nodes that rely on schema from an upstream node
 */
export function useSchemaConnection(
  workflowId: string | null | undefined,
  nodeId: string,
  sourceNodeId: string | null | undefined,
  options?: {
    autoConnect?: boolean;
    pollInterval?: number;
    showNotifications?: boolean;
    debug?: boolean;
  }
) {
  const {
    autoConnect = true,
    pollInterval = 0, // 0 means no polling
    showNotifications = false,
    debug = false
  } = options || {};
  
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  
  // Helper to convert workflowId to database format
  const getDbWorkflowId = useCallback(() => {
    if (!workflowId) return null;
    return workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
  }, [workflowId]);
  
  // Fetch schema from the database
  const fetchSchema = useCallback(async (forceRefresh = false) => {
    // Only attempt to fetch schema if we have all required IDs
    if (!workflowId || !nodeId) {
      if (debug) console.log(`Missing required IDs: workflowId=${workflowId}, nodeId=${nodeId}`);
      setConnectionState(ConnectionState.DISCONNECTED);
      return;
    }
    
    // If no source node, don't fetch schema and clear any existing data
    if (!sourceNodeId) {
      if (debug) console.log(`No source node connected to ${nodeId}, skipping schema fetch`);
      setSchema([]);
      setConnectionState(ConnectionState.DISCONNECTED);
      setError(null);
      return;
    }
    
    if (!forceRefresh) {
      // Try to use cached schema first
      const cachedSchema = await getSchemaFromCache(workflowId, nodeId);
      if (cachedSchema && cachedSchema.length > 0) {
        if (debug) console.log(`Using cached schema for node ${nodeId}, columns:`, cachedSchema.map(c => c.name).join(', '));
        setSchema(cachedSchema);
        setConnectionState(ConnectionState.CONNECTED);
        setError(null);
        return;
      }
    }
    
    setIsLoading(true);
    setError(null);
    setConnectionState(ConnectionState.CONNECTING);
    
    try {
      // Get schema using the Edge Function to ensure we get temporary schemas too
      const { data, error } = await supabase.functions.invoke('inspectSchemas', {
        body: { workflowId, nodeId }
      });
      
      if (error) {
        throw new Error(error.message || 'Error fetching schema');
      }
      
      if (!data || !data.schemas || data.schemas.length === 0) {
        if (debug) console.log(`No schema found for node ${nodeId}`);
        
        // Fall back to regular schema retrieval
        const dbWorkflowId = getDbWorkflowId();
        if (!dbWorkflowId) {
          throw new Error('Invalid workflow ID');
        }
        
        const { data: dbData, error: dbError } = await supabase
          .from('workflow_file_schemas')
          .select('*')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', nodeId);
          
        if (dbError) {
          throw new Error(dbError.message);
        }
        
        if (!dbData || dbData.length === 0) {
          setSchema([]);
          setConnectionState(ConnectionState.DISCONNECTED);
          throw new Error('No schema available for this node');
        }
        
        // Process schema from database
        const schemaData = dbData[0];
        const schemaColumns = schemaData.columns.map((column: string) => ({
          name: column,
          type: schemaData.data_types[column] || 'unknown'
        }));
        
        if (debug) console.log(`Found schema in database for node ${nodeId}, columns:`, schemaColumns.map(c => c.name).join(', '));
        
        // Cache schema
        await cacheSchema(workflowId, nodeId, schemaColumns, {
          source: 'database',
          sheetName: schemaData.sheet_name,
          isTemporary: schemaData.is_temporary
        });
        
        setSchema(schemaColumns);
        setConnectionState(ConnectionState.CONNECTED);
      } else {
        // Process schema from Edge Function
        const schemaData = data.schemas[0];
        const schemaColumns = schemaData.columns.map((column: string) => ({
          name: column,
          type: schemaData.data_types[column] || 'unknown'
        }));
        
        if (debug) console.log(`Found schema via Edge Function for node ${nodeId}, columns:`, schemaColumns.map(c => c.name).join(', '));
        
        // Cache schema
        await cacheSchema(workflowId, nodeId, schemaColumns, {
          source: 'database',
          sheetName: schemaData.sheet_name,
          isTemporary: schemaData.is_temporary
        });
        
        setSchema(schemaColumns);
        setConnectionState(ConnectionState.CONNECTED);
      }
      
      setLastRefreshTime(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error fetching schema';
      if (debug) console.error(`Error fetching schema:`, errorMessage);
      
      // Only show error if we have a source node but couldn't get its schema
      if (sourceNodeId) {
        setError(errorMessage);
        setConnectionState(ConnectionState.ERROR);
        
        if (showNotifications) {
          toast.error(`Error loading schema: ${errorMessage}`);
        }
      } else {
        // If no source node, just set to disconnected without error
        setConnectionState(ConnectionState.DISCONNECTED);
        setError(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [workflowId, nodeId, sourceNodeId, getDbWorkflowId, debug, showNotifications]);
  
  // Refresh schema
  const refreshSchema = useCallback(async () => {
    // Don't try to refresh if there's no source node
    if (!sourceNodeId) {
      if (debug) console.log(`No source node connected to ${nodeId}, skipping schema refresh`);
      return;
    }
    
    // Invalidate cache first
    if (workflowId && nodeId) {
      await invalidateSchemaCache(workflowId, nodeId);
    }
    
    return fetchSchema(true);
  }, [workflowId, nodeId, sourceNodeId, fetchSchema, debug]);
  
  // Subscribe to real-time schema updates (future enhancement)
  useEffect(() => {
    if (!workflowId || !nodeId) return;
    
    // Setup subscription for schema changes
    const channel = supabase
      .channel(`schema-updates-${nodeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workflow_file_schemas',
          filter: `node_id=eq.${nodeId}`
        },
        (payload) => {
          if (debug) console.log(`Schema change detected for node ${nodeId}:`, payload);
          // Only refresh if we have a source node
          if (sourceNodeId) {
            fetchSchema(true);
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflowId, nodeId, sourceNodeId, fetchSchema, debug]);
  
  // Auto-connect effect
  useEffect(() => {
    if (autoConnect && workflowId && nodeId) {
      // Only fetch schema if we have a source node
      if (sourceNodeId) {
        fetchSchema();
      } else {
        // Clear schema and set disconnected state if no source
        setSchema([]);
        setConnectionState(ConnectionState.DISCONNECTED);
        setError(null);
      }
    }
  }, [autoConnect, workflowId, nodeId, sourceNodeId, fetchSchema]);
  
  // Setup polling if requested
  useEffect(() => {
    if (!pollInterval || pollInterval <= 0 || !workflowId || !nodeId || !sourceNodeId) return;
    
    const intervalId = setInterval(() => {
      if (debug) console.log(`Polling schema for node ${nodeId}`);
      fetchSchema();
    }, pollInterval);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [pollInterval, workflowId, nodeId, sourceNodeId, fetchSchema, debug]);
  
  return {
    connectionState,
    schema,
    isLoading,
    error,
    lastRefreshTime,
    refreshSchema
  };
}
