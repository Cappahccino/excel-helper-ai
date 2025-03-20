
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { supabase } from '@/integrations/supabase/client';
import { cacheSchema, getSchemaFromCache } from '@/utils/schema';
import { standardizeColumnType, standardizeSchemaColumns } from './schemaStandardization';

/**
 * Options for schema propagation
 */
interface PropagationOptions {
  sheetName?: string;
  maxRetries?: number;
  retryDelay?: number;
  forceRefresh?: boolean;
}

/**
 * Propagate schema from source node to target node with retry mechanism
 */
export async function propagateSchemaWithRetry(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  options: PropagationOptions = {}
): Promise<boolean> {
  const {
    sheetName,
    maxRetries = 3,
    retryDelay = 1000,
    forceRefresh = false
  } = options;
  
  let retryCount = 0;
  
  const attemptPropagation = async (): Promise<boolean> => {
    try {
      // Try to use edge function for propagation
      const { data, error } = await supabase.functions.invoke('schemaPropagation', {
        body: {
          action: 'propagate',
          workflowId,
          sourceNodeId,
          targetNodeId,
          sheetName,
          forceRefresh
        }
      });
      
      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
      }
      
      if (data?.success) {
        return true;
      }
      
      // If edge function doesn't work, fall back to manual propagation
      // Get source schema
      const sourceSchema = await getSchemaFromCache(workflowId, sourceNodeId, {
        sheetName,
        maxAge: forceRefresh ? 0 : 30000
      });
      
      if (!sourceSchema || sourceSchema.length === 0) {
        throw new Error('Source schema not available');
      }
      
      // Cache in target node
      await cacheSchema(workflowId, targetNodeId, sourceSchema, {
        source: 'propagation',
        sheetName
      });
      
      return true;
    } catch (error) {
      console.error(`Propagation attempt ${retryCount + 1} failed:`, error);
      
      if (retryCount < maxRetries) {
        retryCount++;
        // Wait with exponential backoff
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, retryCount)));
        return attemptPropagation();
      }
      
      return false;
    }
  };
  
  return attemptPropagation();
}

/**
 * Direct schema propagation method without retries
 * Used for simpler propagation cases and as an optimization
 */
export async function propagateSchemaDirectly(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    console.log(`Directly propagating schema from ${sourceNodeId} to ${targetNodeId}`);
    
    // Get source schema from cache or database
    const sourceSchema = await getSchemaFromCache(workflowId, sourceNodeId, {
      sheetName,
      maxAge: 10000 // Use cached data if available and recent (10 seconds)
    });
    
    if (!sourceSchema || sourceSchema.length === 0) {
      console.log('No source schema available for direct propagation');
      return false;
    }
    
    // Cache schema in target node
    await cacheSchema(workflowId, targetNodeId, sourceSchema, {
      source: 'propagation',
      sheetName
    });
    
    return true;
  } catch (error) {
    console.error('Error in propagateSchemaDirectly:', error);
    return false;
  }
}

/**
 * Check if schema propagation is needed between two nodes
 */
export async function checkSchemaPropagationNeeded(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    // Check if source node has schema
    const sourceSchema = await getSchemaFromCache(workflowId, sourceNodeId, {
      sheetName,
      maxAge: 60000  // 1 minute
    });
    
    if (!sourceSchema || sourceSchema.length === 0) {
      // If source has no schema, we can't propagate
      return false;
    }
    
    // Check if target node already has schema
    const targetSchema = await getSchemaFromCache(workflowId, targetNodeId, {
      sheetName,
      maxAge: 60000  // 1 minute
    });
    
    if (!targetSchema || targetSchema.length === 0) {
      // Target has no schema, so propagation is needed
      return true;
    }
    
    // Compare schemas to see if they match
    const sourceFields = new Set(sourceSchema.map(col => col.name));
    const targetFields = new Set(targetSchema.map(col => col.name));
    
    // If they have different number of columns or different column names, propagation is needed
    if (sourceFields.size !== targetFields.size) {
      return true;
    }
    
    for (const field of sourceFields) {
      if (!targetFields.has(field)) {
        return true;
      }
    }
    
    // Schemas match, no propagation needed
    return false;
  } catch (error) {
    console.error('Error checking if schema propagation is needed:', error);
    // Default to requiring propagation on error
    return true;
  }
}

/**
 * Check if a node is ready for schema propagation (has available schema)
 */
export async function isNodeReadyForSchemaPropagation(
  workflowId: string,
  nodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    // Try to get schema from cache first
    const cachedSchema = await getSchemaFromCache(workflowId, nodeId, {
      sheetName,
      maxAge: 60000 // 1 minute
    });
    
    if (cachedSchema && cachedSchema.length > 0) {
      return true;
    }
    
    // If no cached schema, check database
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    const { data, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .eq('sheet_name', sheetName || 'Sheet1')
      .maybeSingle();
      
    if (error) {
      console.error('Error checking if node is ready for propagation:', error);
      return false;
    }
    
    return data?.columns && data.columns.length > 0;
  } catch (error) {
    console.error('Error in isNodeReadyForSchemaPropagation:', error);
    return false;
  }
}

/**
 * Synchronize sheet selection between nodes
 */
export async function synchronizeNodesSheetSelection(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string
): Promise<boolean> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    // Get source node selected sheet
    const { data: sourceConfig } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (!sourceConfig?.metadata || typeof sourceConfig.metadata !== 'object') {
      console.log('No metadata available for source node');
      return false;
    }
    
    const selectedSheet = (sourceConfig.metadata as any).selected_sheet;
    if (!selectedSheet) {
      console.log('No selected sheet in source node');
      return false;
    }
    
    // Update target node metadata with the same selected sheet
    const { data: targetConfig } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId)
      .maybeSingle();
      
    const targetMetadata = targetConfig?.metadata && typeof targetConfig.metadata === 'object'
      ? { ...targetConfig.metadata as object }
      : {};
      
    (targetMetadata as any).selected_sheet = selectedSheet;
    
    // Update target node
    const { error } = await supabase
      .from('workflow_files')
      .update({ metadata: targetMetadata })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId);
      
    if (error) {
      console.error('Error synchronizing sheet selection:', error);
      return false;
    }
    
    // Now propagate schema with the selected sheet
    return await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, selectedSheet);
  } catch (error) {
    console.error('Error in synchronizeNodesSheetSelection:', error);
    return false;
  }
}

/**
 * Get schema specifically formatted for filtering operations
 */
export async function getSchemaForFiltering(
  workflowId: string,
  nodeId: string,
  options: {
    sheetName?: string;
    maxAge?: number;
  } = {}
): Promise<SchemaColumn[]> {
  try {
    const { sheetName, maxAge = 30000 } = options;
    
    // Get schema from cache
    const schema = await getSchemaFromCache(workflowId, nodeId, {
      sheetName,
      maxAge
    });
    
    if (!schema || schema.length === 0) {
      // If no cached schema, try to get from database
      const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
      
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .eq('sheet_name', sheetName || 'Sheet1')
        .maybeSingle();
        
      if (error || !data) {
        console.error('Error getting schema for filtering:', error);
        return [];
      }
      
      // Convert to SchemaColumn format
      const schemaColumns: SchemaColumn[] = data.columns.map(column => ({
        name: column,
        type: standardizeColumnType(data.data_types[column] || 'unknown') as SchemaColumn['type']
      }));
      
      // Cache the schema
      await cacheSchema(workflowId, nodeId, schemaColumns, {
        source: 'database',
        sheetName
      });
      
      return validateSchemaForFiltering(schemaColumns);
    }
    
    return validateSchemaForFiltering(schema);
  } catch (error) {
    console.error('Error in getSchemaForFiltering:', error);
    return [];
  }
}

/**
 * Validate schema for filtering operations
 * Ensures all columns have valid types for filtering
 */
export function validateSchemaForFiltering(schema: SchemaColumn[]): SchemaColumn[] {
  if (!schema || !Array.isArray(schema)) {
    return [];
  }
  
  return schema.filter(column => {
    // Standardize the type
    const standardType = standardizeColumnType(column.type);
    
    // Only include columns with types that can be filtered
    return ['string', 'number', 'date', 'boolean'].includes(standardType);
  });
}
