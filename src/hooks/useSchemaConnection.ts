import { useState, useEffect, useCallback, useRef } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { supabase } from '@/integrations/supabase/client';
import { cacheSchema, getSchemaFromCache, invalidateSchemaCache } from '@/utils/schemaCache';
import { getSchemaForFiltering } from '@/utils/schemaPropagation';
import { toast } from 'sonner';
import { debounce } from 'lodash';

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

type SchemaCache = {
  schema: SchemaColumn[];
  lastUpdated: number;
};

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
    maxRetries?: number;
    retryDelay?: number;
  }
) {
  const {
    autoConnect = true,
    pollInterval = 0, // 0 means no polling
    showNotifications = false,
    debug = false,
    maxRetries = 3,
    retryDelay = 1000
  } = options || {};
  
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  
  // Keep track of retry attempts and cancellation
  const retryCount = useRef<number>(0);
  const isMounted = useRef<boolean>(true);
  const localCache = useRef<SchemaCache | null>(null);
  
  // Helper to convert workflowId to database format
  const getDbWorkflowId = useCallback(() => {
    if (!workflowId) return null;
    return workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
  }, [workflowId]);
  
  // Reset state when sourceNodeId changes
  useEffect(() => {
    if (!sourceNodeId) {
      setConnectionState(ConnectionState.DISCONNECTED);
      setSchema([]);
      setError(null);
      localCache.current = null;
    }
    retryCount.current = 0;
  }, [sourceNodeId]);
  
  // Handle cleanup
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // Debounced schema fetch to prevent rapid multiple requests
  const debouncedFetchSchema = useCallback(
    debounce((forceRefresh: boolean) => {
      fetchSchema(forceRefresh);
    }, 300),
    [workflowId, nodeId, sourceNodeId]
  );
  
  // Fetch schema from the database with retry mechanism
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
    
    if (!forceRefresh && localCache.current?.schema?.length > 0) {
      // Use in-memory cache if available and fresh (less than 5 seconds old)
      const now = Date.now();
      if (now - localCache.current.lastUpdated < 5000) {
        if (debug) console.log(`Using in-memory schema cache for node ${nodeId}`);
        setSchema(localCache.current.schema);
        setConnectionState(ConnectionState.CONNECTED);
        setError(null);
        return;
      }
    }
    
    if (!forceRefresh) {
      // Try to use persistent cache
      const cachedSchema = await getSchemaFromCache(workflowId, nodeId);
      if (cachedSchema && cachedSchema.length > 0) {
        if (debug) console.log(`Using cached schema for node ${nodeId}, columns:`, cachedSchema.map(c => c.name).join(', '));
        setSchema(cachedSchema);
        setConnectionState(ConnectionState.CONNECTED);
        setError(null);
        // Update in-memory cache
        localCache.current = {
          schema: cachedSchema,
          lastUpdated: Date.now()
        };
        return;
      }
    }
    
    // At this point we need to fetch from database
    setIsLoading(true);
    setError(null);
    setConnectionState(ConnectionState.CONNECTING);
    
    try {
      // Get schema using the Edge Function to ensure we get temporary schemas too
      if (debug) console.log(`Fetching schema for node ${nodeId} in workflow ${workflowId}`);
      
      const { data, error } = await supabase.functions.invoke('inspectSchemas', {
        body: { workflowId, nodeId }
      });
      
      if (error) {
        throw new Error(error.message || 'Error fetching schema');
      }
      
      // Check if component is still mounted before updating state
      if (!isMounted.current) return;
      
      if (!data || !data.schemas || data.schemas.length === 0) {
        if (debug) console.log(`No schema found for node ${nodeId}. Source nodes:`, data?.sourceNodes);
        
        // Check if we have source schemas we can use
        if (data.sourceSchemas && data.sourceSchemas.length > 0) {
          // Process first available source schema
          const sourceSchema = data.sourceSchemas[0];
          const schemaColumns = sourceSchema.columns.map((column: string) => ({
            name: column,
            type: sourceSchema.data_types[column] || 'unknown'
          }));
          
          if (debug) console.log(`Using propagated schema from source node, columns:`, schemaColumns.map(c => c.name).join(', '));
          
          // Cache the propagated schema
          await cacheSchema(workflowId, nodeId, schemaColumns, {
            source: 'propagation',
            sheetName: sourceSchema.sheet_name,
            isTemporary: true
          });
          
          // Update in-memory cache
          localCache.current = {
            schema: schemaColumns,
            lastUpdated: Date.now()
          };
          
          setSchema(schemaColumns);
          setConnectionState(ConnectionState.CONNECTED);
          setRetryCount(0);
          setLastRefreshTime(new Date());
          setIsLoading(false);
          return;
        }
        
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
        
        // Check if component is still mounted before updating state
        if (!isMounted.current) return;
        
        if (!dbData || dbData.length === 0) {
          if (retryCount.current < maxRetries) {
            // Schedule a retry with exponential backoff
            retryCount.current += 1;
            const delay = retryDelay * Math.pow(2, retryCount.current - 1);
            if (debug) console.log(`Scheduling retry ${retryCount.current}/${maxRetries} after ${delay}ms`);
            
            setTimeout(() => {
              if (isMounted.current) {
                fetchSchema(forceRefresh);
              }
            }, delay);
            
            // Keep the loading state active during retry
            return;
          }
          
          // If we've exhausted retries, attempt to pull schema from source node
          if (sourceNodeId) {
            try {
              const sourceSchema = await getSchemaForFiltering(workflowId, sourceNodeId, nodeId);
              if (sourceSchema && sourceSchema.length > 0) {
                if (debug) console.log(`Retrieved schema from source node ${sourceNodeId} as fallback`);
                
                // Cache the schema we got from the source
                await cacheSchema(workflowId, nodeId, sourceSchema, {
                  source: 'propagation',
                  isTemporary: true
                });
                
                // Update in-memory cache
                localCache.current = {
                  schema: sourceSchema,
                  lastUpdated: Date.now()
                };
                
                setSchema(sourceSchema);
                setConnectionState(ConnectionState.CONNECTED);
                setRetryCount(0);
                setLastRefreshTime(new Date());
                setIsLoading(false);
                return;
              }
            } catch (sourceError) {
              console.error('Error getting schema from source:', sourceError);
            }
          }
          
          // If all attempts fail, set to disconnected
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
        
        // Update in-memory cache
        localCache.current = {
          schema: schemaColumns,
          lastUpdated: Date.now()
        };
        
        setSchema(schemaColumns);
        setConnectionState(ConnectionState.CONNECTED);
        setRetryCount(0);
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
        
        // Update in-memory cache
        localCache.current = {
          schema: schemaColumns,
          lastUpdated: Date.now()
        };
        
        setSchema(schemaColumns);
        setConnectionState(ConnectionState.CONNECTED);
        setRetryCount(0);
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
      // Check if component is still mounted before updating state
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [workflowId, nodeId, sourceNodeId, getDbWorkflowId, debug, showNotifications, maxRetries, retryDelay]);
  
  // Helper to reset retry count
  const setRetryCount = (count: number) => {
    retryCount.current = count;
  };
  
  // Refresh schema with proper cache invalidation
  const refreshSchema = useCallback(async () => {
    // Don't try to refresh if there's no source node
    if (!sourceNodeId) {
      if (debug) console.log(`No source node connected to ${nodeId}, skipping schema refresh`);
      return false;
    }
    
    // Reset state
    setRetryCount(0);
    setError(null);
    
    // Invalidate cache first
    if (workflowId && nodeId) {
      await invalidateSchemaCache({ workflowId, nodeId });
      localCache.current = null;
    }
    
    // Show notification if enabled
    if (showNotifications) {
      toast.info('Refreshing schema...');
    }
    
    // Fetch with force refresh
    await fetchSchema(true);
    
    return true;
  }, [workflowId, nodeId, sourceNodeId, fetchSchema, debug, showNotifications]);
  
  // Subscribe to real-time schema updates
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
            debouncedFetchSchema(true);
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflowId, nodeId, sourceNodeId, debouncedFetchSchema, debug]);
  
  // Auto-connect effect with debouncing
  useEffect(() => {
    if (autoConnect && workflowId && nodeId) {
      // Only fetch schema if we have a source node
      if (sourceNodeId) {
        if (debug) console.log(`Auto-connecting schema for node ${nodeId} from source ${sourceNodeId}`);
        debouncedFetchSchema(false);
      } else {
        // Clear schema and set disconnected state if no source
        setSchema([]);
        setConnectionState(ConnectionState.DISCONNECTED);
        setError(null);
      }
    }
  }, [autoConnect, workflowId, nodeId, sourceNodeId, debouncedFetchSchema, debug]);
  
  // Setup polling if requested
  useEffect(() => {
    if (!pollInterval || pollInterval <= 0 || !workflowId || !nodeId || !sourceNodeId) return;
    
    const intervalId = setInterval(() => {
      if (debug) console.log(`Polling schema for node ${nodeId}`);
      debouncedFetchSchema(false);
    }, pollInterval);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [pollInterval, workflowId, nodeId, sourceNodeId, debouncedFetchSchema, debug]);
  
  return {
    connectionState,
    schema,
    isLoading,
    error,
    lastRefreshTime,
    refreshSchema,
    hasSourceNode: !!sourceNodeId,
    sourceNodeId
  };
}
