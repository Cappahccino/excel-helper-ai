import { useState, useEffect, useCallback, useRef } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { supabase } from '@/integrations/supabase/client';
import { cacheSchema, getSchemaFromCache, invalidateSchemaCache } from '@/utils/schemaCache';
import { getSchemaForFiltering, propagateSchemaWithRetry } from '@/utils/schemaPropagation';
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
  sheetName?: string;
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
    sheetName?: string;
  }
) {
  const {
    autoConnect = true,
    pollInterval = 0, // 0 means no polling
    showNotifications = false,
    debug = false,
    maxRetries = 3,
    retryDelay = 1000,
    sheetName: initialSheetName
  } = options || {};
  
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [sheetName, setSheetName] = useState<string | undefined>(initialSheetName);
  
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

  // Get source node's selected sheet if not provided
  const getSourceNodeSheet = useCallback(async () => {
    if (!workflowId || !sourceNodeId) return null;
    if (sheetName) return sheetName;
    
    try {
      const dbWorkflowId = getDbWorkflowId();
      
      // Get source node metadata to find selected sheet
      const { data: sourceNodeData, error: sourceError } = await supabase
        .from('workflow_files')
        .select('metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .maybeSingle();
        
      if (sourceError || !sourceNodeData?.metadata) {
        if (debug) console.error('Error getting source node metadata:', sourceError || 'No metadata found');
        return null;
      }
      
      // Type-safe access to metadata
      if (typeof sourceNodeData.metadata !== 'object' || sourceNodeData.metadata === null) {
        if (debug) console.warn(`Source node metadata is not an object type: ${typeof sourceNodeData.metadata}`);
        return null;
      }
      
      const metadata = sourceNodeData.metadata as Record<string, any>;
      const selectedSheet = metadata.selected_sheet;
      
      if (debug) {
        console.log(`Found selected sheet "${selectedSheet}" for source node ${sourceNodeId}`);
      }
      
      if (selectedSheet) {
        setSheetName(selectedSheet);
      }
      
      return selectedSheet;
    } catch (err) {
      console.error('Error getting source node sheet:', err);
      return null;
    }
  }, [workflowId, sourceNodeId, getDbWorkflowId, debug, sheetName]);
  
  // Declaration of fetchSchema
  const fetchSchema = useCallback(async (forceRefresh = false) => {
    // Only attempt to fetch schema if we have all required IDs
    if (!workflowId || !nodeId) {
      if (debug) console.log(`Missing required IDs: workflowId=${workflowId}, nodeId=${nodeId}`);
      setConnectionState(ConnectionState.DISCONNECTED);
      return false;
    }
    
    // If no source node, don't fetch schema and clear any existing data
    if (!sourceNodeId) {
      if (debug) console.log(`No source node connected to ${nodeId}, skipping schema fetch`);
      setSchema([]);
      setConnectionState(ConnectionState.DISCONNECTED);
      setError(null);
      return false;
    }
    
    // Get the current sheet name from the source node if not already set
    const effectiveSheetName = sheetName || await getSourceNodeSheet();
    
    if (debug) {
      console.log(`Fetching schema for node ${nodeId} with sheet "${effectiveSheetName || 'default'}"`);
    }
    
    if (!forceRefresh && localCache.current?.schema?.length > 0 && localCache.current?.sheetName === effectiveSheetName) {
      // Use in-memory cache if available and fresh (less than 5 seconds old)
      const now = Date.now();
      if (now - localCache.current.lastUpdated < 5000) {
        if (debug) console.log(`Using in-memory schema cache for node ${nodeId}`);
        setSchema(localCache.current.schema);
        setConnectionState(ConnectionState.CONNECTED);
        setError(null);
        return true;
      }
    }
    
    if (!forceRefresh) {
      // Try to use persistent cache
      const cachedSchema = await getSchemaFromCache(workflowId, nodeId, {
        sheetName: effectiveSheetName
      });
      if (cachedSchema && cachedSchema.length > 0) {
        if (debug) console.log(`Using cached schema for node ${nodeId}, columns:`, cachedSchema.map(c => c.name).join(', '));
        setSchema(cachedSchema);
        setConnectionState(ConnectionState.CONNECTED);
        setError(null);
        // Update in-memory cache
        localCache.current = {
          schema: cachedSchema,
          lastUpdated: Date.now(),
          sheetName: effectiveSheetName
        };
        return true;
      }
    }
    
    // At this point we need to fetch from database
    setIsLoading(true);
    setError(null);
    setConnectionState(ConnectionState.CONNECTING);
    
    try {
      // Get schema using the Edge Function to ensure we get temporary schemas too
      const { data, error } = await supabase.functions.invoke('inspectSchemas', {
        body: { 
          workflowId, 
          nodeId,
          sheetName: effectiveSheetName 
        }
      });
      
      if (error) {
        if (debug) console.error('Error from Edge Function:', error);
        throw new Error(error.message || 'Error fetching schema');
      }
      
      // Check if component is still mounted before updating state
      if (!isMounted.current) return false;
      
      if (!data || !data.schemas || data.schemas.length === 0) {
        if (debug) console.log(`No schema found for node ${nodeId}`);
        
        if (data && data.sourceNodes && data.sourceNodes.includes(sourceNodeId)) {
          if (debug) console.log(`Source node ${sourceNodeId} is confirmed, trying propagation`);
          
          // Try source propagation if we have a source node
          const propagateSuccess = await propagateSchemaWithRetry(workflowId, sourceNodeId, nodeId, {
            maxRetries: 1,
            sheetName: effectiveSheetName
          });
          
          if (propagateSuccess) {
            if (debug) console.log(`Schema propagation successful`);
            // Retry fetch after propagation
            return await fetchSchema(true);
          }
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
          .eq('node_id', nodeId)
          .eq('sheet_name', effectiveSheetName || 'Sheet1');
          
        if (dbError) {
          throw new Error(dbError.message);
        }
        
        // Check if component is still mounted before updating state
        if (!isMounted.current) return false;
        
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
            return false;
          }
          
          // If we've exhausted retries, set to disconnected
          setSchema([]);
          setConnectionState(ConnectionState.DISCONNECTED);
          setError(`No schema available for node ${nodeId} with sheet ${effectiveSheetName || 'default'}`);
          return false;
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
          sheetName: effectiveSheetName,
          isTemporary: schemaData.is_temporary
        });
        
        // Update in-memory cache
        localCache.current = {
          schema: schemaColumns,
          lastUpdated: Date.now(),
          sheetName: effectiveSheetName
        };
        
        setSchema(schemaColumns);
        setConnectionState(ConnectionState.CONNECTED);
        setRetryCount(0);
        return true;
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
          sheetName: effectiveSheetName,
          isTemporary: schemaData.is_temporary
        });
        
        // Update in-memory cache
        localCache.current = {
          schema: schemaColumns,
          lastUpdated: Date.now(),
          sheetName: effectiveSheetName
        };
        
        setSchema(schemaColumns);
        setConnectionState(ConnectionState.CONNECTED);
        setRetryCount(0);
        return true;
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
      return false;
    } finally {
      // Check if component is still mounted before updating state
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [workflowId, nodeId, sourceNodeId, getDbWorkflowId, debug, showNotifications, maxRetries, retryDelay, sheetName, getSourceNodeSheet]);
  
  // Debounced schema fetch to prevent rapid multiple requests
  const debouncedFetchSchema = useCallback(
    debounce(async (forceRefresh: boolean) => {
      await fetchSchema(forceRefresh);
    }, 300),
    [fetchSchema]
  );
  
  // Helper to reset retry count
  const setRetryCount = (count: number) => {
    retryCount.current = count;
  };
  
  // Force propagation of schema from source to this node
  const forceSchemaPropagation = useCallback(async () => {
    if (!workflowId || !nodeId || !sourceNodeId) {
      if (debug) console.log(`Cannot force propagate: missing id(s): wf=${workflowId}, node=${nodeId}, source=${sourceNodeId}`);
      return false;
    }
    
    setIsLoading(true);
    setConnectionState(ConnectionState.CONNECTING);
    
    try {
      const effectiveSheetName = sheetName || await getSourceNodeSheet();
      if (debug) {
        console.log(`Forcing schema propagation from ${sourceNodeId} to ${nodeId}, sheet: ${effectiveSheetName || 'default'}`);
      }
      
      // Invalidate cache first
      await invalidateSchemaCache(workflowId, nodeId, effectiveSheetName);
      localCache.current = null;
      
      if (showNotifications) {
        toast.info('Propagating schema from source node...');
      }
      
      // Try to propagate using utility function
      const success = await propagateSchemaWithRetry(workflowId, sourceNodeId, nodeId, {
        maxRetries: maxRetries,
        sheetName: effectiveSheetName,
        forceRefresh: true
      });
      
      if (!isMounted.current) return false;
      
      if (success) {
        if (debug) console.log(`Successfully propagated schema: ${sourceNodeId} -> ${nodeId}`);
        
        // Refresh schema after propagation
        await fetchSchema(true);
        
        if (showNotifications) {
          toast.success('Schema updated from source');
        }
        
        return true;
      } else {
        if (debug) console.log(`Schema propagation failed, trying direct fetch`);
        
        // Even if propagation fails, try to fetch schema directly 
        const result = await fetchSchema(true);
        
        if (!result && showNotifications) {
          toast.error('Failed to update schema from source');
        }
        
        return result;
      }
    } catch (err) {
      if (debug) console.error('Error in forceSchemaPropagation:', err);
      setError(`Propagation failed: ${(err as Error).message}`);
      setConnectionState(ConnectionState.ERROR);
      
      if (showNotifications) {
        toast.error('Error updating schema from source');
      }
      
      return false;
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [workflowId, nodeId, sourceNodeId, debug, sheetName, maxRetries, getSourceNodeSheet, showNotifications, fetchSchema]);
  
  // Refresh schema with proper cache invalidation
  const refreshSchema = useCallback(async () => {
    // Don't try to refresh if there's no source node
    if (!sourceNodeId) {
      if (debug) console.log(`No source node connected to ${nodeId}, skipping schema refresh`);
      return false;
    }
    
    // Get latest sheet name first
    const currentSheetName = await getSourceNodeSheet();
    
    // Reset state
    setRetryCount(0);
    setError(null);
    
    // Invalidate cache first
    if (workflowId && nodeId) {
      await invalidateSchemaCache(workflowId, nodeId, currentSheetName);
      localCache.current = null;
    }
    
    // Show notification if enabled
    if (showNotifications) {
      toast.info('Refreshing schema...');
    }
    
    // Fetch with force refresh
    const result = await fetchSchema(true);
    
    return result;
  }, [workflowId, nodeId, sourceNodeId, fetchSchema, debug, showNotifications, getSourceNodeSheet]);
  
  // Run diagnostic information to help debug schema issues
  const runSchemaDiagnostics = useCallback(async () => {
    if (!workflowId || !nodeId) {
      console.log("Cannot run schema diagnostics: missing workflowId or nodeId");
      return null;
    }
    
    if (showNotifications) {
      toast.info('Running schema diagnostics...');
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('inspectSchemas', {
        body: { 
          workflowId, 
          nodeId,
          source: sourceNodeId,
          includeSourceSchemas: true,
          includeEdges: true,
          verbose: true
        }
      });
      
      if (error) {
        if (showNotifications) {
          toast.error(`Diagnostics error: ${error.message}`);
        }
        return null;
      }
      
      console.log('Schema diagnostics:', data);
      
      if (showNotifications) {
        if (data.schemaCount > 0) {
          toast.success(`Found ${data.schemaCount} schema entries`);
        } else if (data.sourceSchemas && data.sourceSchemas.length > 0) {
          toast.info(`No schema for this node, but found ${data.sourceSchemas.length} schemas from source nodes`);
          
          // Attempt repair
          await forceSchemaPropagation();
        } else {
          toast.warning('No schemas found');
        }
      }
      
      return data;
    } catch (error) {
      console.error('Error running diagnostics:', error);
      if (showNotifications) {
        toast.error(`Diagnostics failed: ${(error as Error).message}`);
      }
      return null;
    }
  }, [workflowId, nodeId, sourceNodeId, showNotifications, forceSchemaPropagation]);
  
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
  
  // Subscribe to source node metadata changes (for sheet selection)
  useEffect(() => {
    if (!workflowId || !nodeId || !sourceNodeId) return;
    
    const dbWorkflowId = getDbWorkflowId();
    if (!dbWorkflowId) return;
    
    // Setup subscription for source node metadata changes
    const channel = supabase
      .channel(`source-node-metadata-${sourceNodeId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workflow_files',
          filter: `workflow_id=eq.${dbWorkflowId} AND node_id=eq.${sourceNodeId}`
        },
        async (payload) => {
          const metadata = payload.new.metadata;
          if (debug) console.log(`Source node metadata changed:`, metadata);
          
          // Check if sheet selection has changed
          if (metadata && typeof metadata === 'object' && metadata !== null && 'selected_sheet' in metadata) {
            const selectedSheet = (metadata as { selected_sheet?: string }).selected_sheet;
            if (selectedSheet && selectedSheet !== sheetName) {
              if (debug) console.log(`Source node sheet changed to ${selectedSheet}, refreshing schema`);
              setSheetName(selectedSheet);
              // Invalidate cache and fetch new schema
              await invalidateSchemaCache(workflowId, nodeId, selectedSheet);
              await fetchSchema(true);
            }
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflowId, nodeId, sourceNodeId, fetchSchema, debug, getDbWorkflowId, sheetName]);
  
  // Auto-connect effect with debouncing
  useEffect(() => {
    if (autoConnect && workflowId && nodeId) {
      // Only fetch schema if we have a source node
      if (sourceNodeId) {
        debouncedFetchSchema(false);
      } else {
        // Clear schema and set disconnected state if no source
        setSchema([]);
        setConnectionState(ConnectionState.DISCONNECTED);
        setError(null);
      }
    }
  }, [autoConnect, workflowId, nodeId, sourceNodeId, debouncedFetchSchema]);
  
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
    forceSchemaPropagation,
    runSchemaDiagnostics,
    hasSourceNode: !!sourceNodeId,
    sourceNodeId,
    sheetName
  };
}
