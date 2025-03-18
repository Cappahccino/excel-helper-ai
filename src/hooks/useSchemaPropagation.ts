import { useState, useCallback, useEffect } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  propagateSchemaDirectly, 
  propagateSchemaWithRetry,
  getSchemaForFiltering
} from '@/utils/schemaPropagation';
import { 
  cacheSchema, 
  getSchemaFromCache,
  getSchemaMetadataFromCache,
  invalidateSchemaCache,
  isValidCacheExistsAsync,
  hasFileAssociated
} from '@/utils/schemaCache';
import { useSchemaSubscription } from './useSchemaSubscription';

type PropagationStatus = 'idle' | 'propagating' | 'success' | 'error';

interface PropagationState {
  status: PropagationStatus;
  error?: string;
  lastUpdated?: number;
  schema?: SchemaColumn[];
}

interface PropagationOptions {
  /**
   * Whether to try to force refresh schema through the file processor
   */
  forceRefresh?: boolean;
  
  /**
   * The sheet name to use
   */
  sheetName?: string;
  
  /**
   * Maximum number of retries
   */
  maxRetries?: number;
  
  /**
   * Whether to automatically propagate schema on connection
   */
  autoPropagateOnConnection?: boolean;
  
  /**
   * Whether to show toast notifications
   */
  showNotifications?: boolean;
  
  /**
   * Whether to subscribe to schema updates via Redis
   */
  subscribeToUpdates?: boolean;
}

/**
 * Hook for managing schema propagation between nodes
 * Enhanced with Redis-based distributed caching and real-time updates
 */
export function useSchemaPropagation(
  workflowId: string | null,
  targetNodeId: string,
  sourceNodeId: string | null | undefined,
  options: PropagationOptions = {}
) {
  const {
    forceRefresh = false,
    sheetName,
    maxRetries = 3,
    autoPropagateOnConnection = true,
    showNotifications = true,
    subscribeToUpdates = true
  } = options;
  
  const [state, setState] = useState<PropagationState>({
    status: 'idle'
  });
  
  const [lastMissingFileNotification, setLastMissingFileNotification] = useState<number>(0);
  
  const { 
    isSubscribed,
    lastUpdate: subscriptionUpdate,
    refreshSchema: refreshSubscription
  } = useSchemaSubscription(
    workflowId, 
    targetNodeId,
    {
      debug: false,
      onSchemaUpdated: (schema, meta) => {
        console.log(`Schema updated via subscription: source=${meta.source}, version=${meta.version}`);
        setState(prev => ({
          ...prev,
          status: 'success',
          schema,
          lastUpdated: Date.now()
        }));
      },
      pollingInterval: subscribeToUpdates ? 5000 : 1000000
    }
  );
  
  const getNormalizedWorkflowId = useCallback(() => {
    if (!workflowId) return null;
    return workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
  }, [workflowId]);
  
  const checkSourceHasFile = useCallback(async (): Promise<boolean> => {
    if (!workflowId || !sourceNodeId) return false;
    
    try {
      const hasFile = await hasFileAssociated(workflowId, sourceNodeId);
      
      if (!hasFile) {
        const now = Date.now();
        if (showNotifications && (now - lastMissingFileNotification > 10000)) {
          toast.warning("Please select a file in the source node", {
            description: "Schema propagation requires a file to be selected",
            duration: 5000,
          });
          setLastMissingFileNotification(now);
        }
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error checking if source has file:', error);
      return false;
    }
  }, [workflowId, sourceNodeId, showNotifications, lastMissingFileNotification]);
  
  const checkPropagationNeeded = useCallback(async () => {
    if (!workflowId || !sourceNodeId || !targetNodeId) return false;
    
    const hasFile = await checkSourceHasFile();
    if (!hasFile) {
      console.log(`Source node ${sourceNodeId} has no file - propagation not needed yet`);
      return false;
    }
    
    const cachedSchema = await getSchemaFromCache(workflowId, targetNodeId, {
      maxAge: 60000,
      sheetName
    });
    
    if (cachedSchema && cachedSchema.length > 0) {
      console.log(`Using cached schema for ${targetNodeId}`);
      setState(prev => ({
        ...prev,
        status: 'success',
        schema: cachedSchema,
        lastUpdated: Date.now()
      }));
      return false;
    }
    
    try {
      const dbWorkflowId = getNormalizedWorkflowId();
      if (!dbWorkflowId) return false;
      
      const { data: targetSchema, error } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', targetNodeId)
        .eq('sheet_name', sheetName || 'Sheet1')
        .maybeSingle();
        
      if (error) {
        console.error('Error checking target schema:', error);
        return true;
      }
      
      if (!targetSchema || !targetSchema.columns || targetSchema.columns.length === 0) {
        return true;
      }
      
      const schema = targetSchema.columns.map(column => ({
        name: column,
        type: targetSchema.data_types[column] || 'unknown'
      }));
      
      await cacheSchema(workflowId, targetNodeId, schema, {
        source: 'database',
        sheetName: sheetName || 'Sheet1'
      });
      
      setState(prev => ({
        ...prev,
        status: 'success',
        schema,
        lastUpdated: Date.now()
      }));
      
      return false;
    } catch (error) {
      console.error('Error in checkPropagationNeeded:', error);
      return true;
    }
  }, [workflowId, sourceNodeId, targetNodeId, getNormalizedWorkflowId, sheetName, checkSourceHasFile]);
  
  const propagateSchema = useCallback(async () => {
    if (!workflowId || !sourceNodeId || !targetNodeId) {
      console.log('Missing required IDs for propagation');
      return false;
    }
    
    const hasFile = await checkSourceHasFile();
    if (!hasFile) {
      setState(prev => ({ 
        ...prev, 
        status: 'error',
        error: 'Source node has no file selected',
        lastUpdated: Date.now()
      }));
      return false;
    }
    
    setState(prev => ({ ...prev, status: 'propagating' }));
    
    try {
      console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId}`);
      
      if (showNotifications) {
        toast.info('Updating schema...');
      }
      
      let success = false;
      try {
        success = await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sheetName);
      } catch (error) {
        console.warn('Direct propagation failed, falling back to retry mechanism:', error);
        success = false;
      }
      
      if (!success) {
        success = await propagateSchemaWithRetry(workflowId, sourceNodeId, targetNodeId, {
          maxRetries,
          sheetName,
          forceRefresh
        });
      }
      
      if (success) {
        const schema = await getSchemaForFiltering(workflowId, targetNodeId, { 
          sheetName, 
          forceRefresh: false 
        });
        
        if (schema && schema.length > 0) {
          await cacheSchema(workflowId, targetNodeId, schema, {
            source: 'propagation',
            sheetName
          });
        }
        
        setState({
          status: 'success',
          schema,
          lastUpdated: Date.now()
        });
        
        if (showNotifications) {
          toast.success('Schema updated successfully');
        }
        
        if (subscribeToUpdates) {
          refreshSubscription();
        }
        
        return true;
      } else {
        setState({
          status: 'error',
          error: 'Failed to propagate schema',
          lastUpdated: Date.now()
        });
        
        if (showNotifications) {
          toast.error('Failed to update schema');
        }
        
        return false;
      }
    } catch (error) {
      console.error('Error in propagateSchema:', error);
      
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        lastUpdated: Date.now()
      });
      
      if (showNotifications) {
        toast.error('Error updating schema');
      }
      
      return false;
    }
  }, [workflowId, sourceNodeId, targetNodeId, maxRetries, sheetName, forceRefresh, showNotifications, subscribeToUpdates, refreshSubscription, checkSourceHasFile]);
  
  useEffect(() => {
    if (autoPropagateOnConnection && sourceNodeId && targetNodeId) {
      let isActive = true;
      
      checkPropagationNeeded().then(needed => {
        if (isActive && needed) {
          propagateSchema();
        }
      });
      
      return () => {
        isActive = false;
      };
    }
  }, [autoPropagateOnConnection, sourceNodeId, targetNodeId, checkPropagationNeeded, propagateSchema]);
  
  const refreshSchema = useCallback(async () => {
    if (sourceNodeId) {
      const hasFile = await checkSourceHasFile();
      if (!hasFile) {
        if (showNotifications) {
          toast.error('Please select a file in the source node first');
        }
        return false;
      }
    }
    
    if (workflowId && targetNodeId) {
      await invalidateSchemaCache(workflowId, targetNodeId, sheetName);
    }
    
    if (subscribeToUpdates) {
      await refreshSubscription();
    }
    
    if (sourceNodeId) {
      return propagateSchema();
    } else {
      try {
        setState(prev => ({ ...prev, status: 'propagating' }));
        
        const { data, error } = await supabase.functions.invoke('schemaPropagation', {
          body: {
            action: 'refreshSchema',
            workflowId,
            nodeId: targetNodeId
          }
        });
        
        if (error) {
          throw new Error(error.message);
        }
        
        if (data?.schema) {
          await cacheSchema(workflowId!, targetNodeId, data.schema, {
            source: "refresh",
            version: data.version
          });
          
          setState({
            status: 'success',
            schema: data.schema,
            lastUpdated: Date.now()
          });
          
          if (showNotifications) {
            toast.success('Schema refreshed successfully');
          }
          
          return true;
        } else {
          throw new Error('No schema returned from refresh');
        }
      } catch (error) {
        console.error('Error refreshing schema:', error);
        
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          lastUpdated: Date.now()
        });
        
        if (showNotifications) {
          toast.error('Error refreshing schema');
        }
        
        return false;
      }
    }
  }, [workflowId, targetNodeId, sourceNodeId, sheetName, propagateSchema, refreshSubscription, subscribeToUpdates, showNotifications, checkSourceHasFile]);
  
  const getSchema = useCallback(async (): Promise<SchemaColumn[]> => {
    if (!workflowId || !targetNodeId) return [];
    
    try {
      const cachedSchema = await getSchemaFromCache(workflowId, targetNodeId, { sheetName });
      if (cachedSchema) return cachedSchema;
      
      const schema = await getSchemaForFiltering(workflowId, targetNodeId, { sheetName });
      
      if (schema && schema.length > 0) {
        await cacheSchema(workflowId, targetNodeId, schema, { sheetName });
      }
      
      return schema;
    } catch (error) {
      console.error('Error getting schema:', error);
      return [];
    }
  }, [workflowId, targetNodeId, sheetName]);
  
  return {
    state,
    propagateSchema,
    refreshSchema,
    getSchema,
    isPropagating: state.status === 'propagating',
    hasError: state.status === 'error',
    error: state.error,
    schema: state.schema || [],
    lastUpdated: state.lastUpdated,
    hasSourceFile: checkSourceHasFile,
    isSubscribed,
    lastSubscriptionUpdate: subscriptionUpdate,
    subscriptionEnabled: subscribeToUpdates
  };
}
