
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
  invalidateSchemaCache 
} from '@/utils/schemaCache';

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
}

/**
 * Hook for managing schema propagation between nodes
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
    showNotifications = true
  } = options;
  
  const [state, setState] = useState<PropagationState>({
    status: 'idle'
  });
  
  // Helper to get normalized workflow ID
  const getNormalizedWorkflowId = useCallback(() => {
    if (!workflowId) return null;
    return workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
  }, [workflowId]);
  
  // Check if propagation is needed
  const checkPropagationNeeded = useCallback(async () => {
    if (!workflowId || !sourceNodeId || !targetNodeId) return false;
    
    // First check cache
    const cachedSchema = getSchemaFromCache(workflowId, targetNodeId, {
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
    
    // Check database for existing schema
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
      
      // If target has no schema, propagation is needed
      if (!targetSchema || !targetSchema.columns || targetSchema.columns.length === 0) {
        return true;
      }
      
      // If we have schema, format and cache it
      const schema = targetSchema.columns.map(column => ({
        name: column,
        type: targetSchema.data_types[column] || 'unknown'
      }));
      
      cacheSchema(workflowId, targetNodeId, schema, {
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
  
  // Propagate schema function
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
      
      const success = await propagateSchemaWithRetry(workflowId, sourceNodeId, targetNodeId, {
        maxRetries,
        sheetName,
        forceRefresh
      });
      
      if (success) {
        // Get schema for the target node after propagation
        const schema = await getSchemaForFiltering(workflowId, targetNodeId, { 
          sheetName, 
          forceRefresh: false 
        });
        
        // Cache the schema
        if (schema && schema.length > 0) {
          cacheSchema(workflowId, targetNodeId, schema, {
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
  }, [workflowId, sourceNodeId, targetNodeId, maxRetries, sheetName, forceRefresh, showNotifications]);
  
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
      invalidateSchemaCache(workflowId, targetNodeId, sheetName);
    }
    
    return propagateSchema();
  }, [workflowId, targetNodeId, sheetName, propagateSchema]);
  
  // Get schema for the target node
  const getSchema = useCallback(async (): Promise<SchemaColumn[]> => {
    if (!workflowId || !targetNodeId) return [];
    
    try {
      // Try cache first
      const cachedSchema = getSchemaFromCache(workflowId, targetNodeId, { sheetName });
      if (cachedSchema) return cachedSchema;
      
      // Get from database
      const schema = await getSchemaForFiltering(workflowId, targetNodeId, { sheetName });
      
      if (schema && schema.length > 0) {
        cacheSchema(workflowId, targetNodeId, schema, { sheetName });
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
    lastUpdated: state.lastUpdated
  };
}
