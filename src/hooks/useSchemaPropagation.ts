import { useState, useCallback, useEffect } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  propagateSchemaDirectly, 
  propagateSchemaWithRetry,
  getSchemaForFiltering,
  isNodeReadyForSchemaPropagation
} from '@/utils/schemaPropagation';
import { 
  cacheSchema, 
  getSchemaFromCache, 
  invalidateSchemaCache,
  isValidCacheExistsAsync
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
  
  // Subscribe to real-time schema updates if enabled
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
      // Only use subscription if requested
      pollingInterval: subscribeToUpdates ? 5000 : 1000000 // Effectively disable polling if not subscribing
    }
  );
  
  // Helper to get normalized workflow ID
  const getNormalizedWorkflowId = useCallback(() => {
    if (!workflowId) return null;
    return workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
  }, [workflowId]);
  
  // Check if propagation is needed
  const checkPropagationNeeded = useCallback(async () => {
    if (!workflowId || !sourceNodeId || !targetNodeId) return false;
    
    try {
      // First check if source node has schema
      const isSourceReady = await isNodeReadyForSchemaPropagation(workflowId, sourceNodeId, sheetName);
      if (!isSourceReady) {
        console.log(`Source node ${sourceNodeId} is not ready for propagation`);
        return false;
      }
      
      // First check cache for target node
      const cachedSchema = await getSchemaFromCache(workflowId, targetNodeId, {
        maxAge: 60000, // 1 minute
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
      
      // Check if target already has schema in database
      const dbWorkflowId = getNormalizedWorkflowId();
      if (!dbWorkflowId) return false;
      
      const { data: targetSchema, error: targetError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', targetNodeId)
        .eq('sheet_name', sheetName || 'Sheet1')
        .maybeSingle();
        
      if (targetError) {
        console.error('Error checking target schema:', targetError);
        return true;
      }
      
      // If target has no schema for this sheet, propagation is needed
      if (!targetSchema || !targetSchema.columns || targetSchema.columns.length === 0) {
        console.log(`No schema found for target node ${targetNodeId} with sheet ${sheetName || 'Sheet1'}, propagation needed`);
        return true;
      }
      
      // If we have schema, format and cache it
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
  }, [workflowId, sourceNodeId, targetNodeId, getNormalizedWorkflowId, sheetName]);
  
  // Propagate schema function, now enhanced with Edge Function
  const propagateSchema = useCallback(async () => {
    if (!workflowId || !sourceNodeId || !targetNodeId) {
      console.log('Missing required IDs for propagation');
      return false;
    }
    
    setState(prev => ({ ...prev, status: 'propagating' }));
    
    try {
      console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId}`);
      
      if (showNotifications) {
        toast.info('Updating schema...');
      }
      
      // First try the direct Edge Function approach for better performance
      let success = false;
      try {
        success = await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sheetName);
      } catch (error) {
        console.warn('Direct propagation failed, falling back to retry mechanism:', error);
        success = false;
      }
      
      // Fall back to retry mechanism if direct approach fails
      if (!success) {
        success = await propagateSchemaWithRetry(workflowId, sourceNodeId, targetNodeId, {
          maxRetries,
          sheetName,
          forceRefresh
        });
      }
      
      if (success) {
        // Get schema for the target node after propagation
        const schema = await getSchemaForFiltering(workflowId, targetNodeId, { 
          sheetName, 
          forceRefresh: false 
        });
        
        // Cache the schema
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
        
        // Refresh subscription to pick up changes
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
  }, [workflowId, sourceNodeId, targetNodeId, maxRetries, sheetName, forceRefresh, showNotifications, subscribeToUpdates, refreshSubscription]);
  
  // Effect to auto-propagate on connection if needed
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
  
  // Force refresh schema
  const refreshSchema = useCallback(async () => {
    // Invalidate cache first
    if (workflowId && targetNodeId) {
      await invalidateSchemaCache(workflowId, targetNodeId, sheetName);
    }
    
    // Refresh subscription first if enabled
    if (subscribeToUpdates) {
      await refreshSubscription();
    }
    
    // Propagate schema if we have a source, otherwise just refresh from database
    if (sourceNodeId) {
      return propagateSchema();
    } else {
      try {
        setState(prev => ({ ...prev, status: 'propagating' }));
        
        // Get schema directly from the Edge Function
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
  }, [workflowId, targetNodeId, sourceNodeId, sheetName, propagateSchema, refreshSubscription, subscribeToUpdates, showNotifications]);
  
  // Get schema for the target node
  const getSchema = useCallback(async (): Promise<SchemaColumn[]> => {
    if (!workflowId || !targetNodeId) return [];
    
    try {
      // Try cache first
      const cachedSchema = await getSchemaFromCache(workflowId, targetNodeId, { sheetName });
      if (cachedSchema) return cachedSchema;
      
      // Get from database or Edge Function
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
  
  // Return extended API with subscription info
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
    // Subscription status
    isSubscribed,
    lastSubscriptionUpdate: subscriptionUpdate,
    subscriptionEnabled: subscribeToUpdates
  };
}
