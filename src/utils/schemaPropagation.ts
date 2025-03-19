
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { cacheSchema, invalidateSchemaCache } from '@/utils/schema';

// Define proper interface for file metadata to avoid TypeScript errors
export interface FileMetadata {
  selected_sheet?: string;
  sheets?: Array<{
    name: string;
    index: number;
    row_count?: number;
    rowCount?: number;
    is_default?: boolean;
    isDefault?: boolean;
  }>;
  [key: string]: any;
}

/**
 * Propagate schema from source node to target node with robust error handling and retries
 */
export async function propagateSchemaWithRetry(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    sheetName?: string;
  } = {}
): Promise<boolean> {
  const { maxRetries = 3, retryDelay = 1000, sheetName } = options;
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    try {
      // Normalize workflow ID
      const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
      
      console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId} (attempt ${retryCount + 1}/${maxRetries + 1})`);
      
      // Get source schema
      const { data: sourceSchema, error: sourceError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types, file_id, sheet_name')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .eq('sheet_name', sheetName || 'Sheet1')
        .maybeSingle();
        
      if (sourceError) {
        console.error('Error fetching source schema:', sourceError);
        throw sourceError;
      }
      
      if (!sourceSchema || !sourceSchema.columns || sourceSchema.columns.length === 0) {
        if (retryCount < maxRetries) {
          console.log(`Source schema not found, retry ${retryCount + 1}/${maxRetries}`);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount)));
          continue;
        }
        console.warn('Source node has no schema available after retries');
        return false;
      }
      
      // Convert to SchemaColumn format for caching
      const schemaColumns: SchemaColumn[] = sourceSchema.columns.map(col => ({
        name: col,
        type: sourceSchema.data_types[col] || 'unknown'
      }));
      
      // Propagate schema to target node
      const { error: updateError } = await supabase
        .from('workflow_file_schemas')
        .upsert({
          workflow_id: dbWorkflowId,
          node_id: targetNodeId,
          file_id: sourceSchema.file_id,
          columns: sourceSchema.columns,
          data_types: sourceSchema.data_types,
          sheet_name: sheetName || sourceSchema.sheet_name || 'Sheet1',
          updated_at: new Date().toISOString()
        });
        
      if (updateError) {
        console.error('Error updating target schema:', updateError);
        throw updateError;
      }
      
      // Cache the propagated schema
      await cacheSchema(workflowId, targetNodeId, schemaColumns, {
        source: 'propagation',
        sheetName: sheetName || sourceSchema.sheet_name || 'Sheet1'
      });
      
      console.log(`Schema successfully propagated from ${sourceNodeId} to ${targetNodeId}`);
      return true;
    } catch (err) {
      if (retryCount < maxRetries) {
        console.log(`Error propagating schema, retry ${retryCount + 1}/${maxRetries}:`, err);
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount)));
      } else {
        console.error('Schema propagation failed after retries:', err);
        return false;
      }
    }
  }
  
  return false;
}

/**
 * More direct approach to propagate schema via Edge Function
 */
export async function propagateSchemaDirectly(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  if (!workflowId || !sourceNodeId || !targetNodeId) {
    console.error('Missing required parameters for schema propagation');
    return false;
  }
  
  try {
    console.log(`Directly propagating schema from ${sourceNodeId} to ${targetNodeId}`);
    
    // Call the Edge Function for direct propagation
    const { data, error } = await supabase.functions.invoke('schemaPropagation', {
      body: {
        action: 'propagateSchema',
        workflowId,
        sourceNodeId,
        targetNodeId,
        sheetName
      }
    });
    
    if (error) {
      console.error('Error invoking schema propagation:', error);
      return false;
    }
    
    if (!data.success) {
      console.error('Schema propagation failed:', data.message);
      return false;
    }
    
    // Invalidate target schema cache
    await invalidateSchemaCache(workflowId, targetNodeId, sheetName);
    
    console.log('Direct schema propagation successful');
    return true;
  } catch (error) {
    console.error('Exception during direct schema propagation:', error);
    return false;
  }
}

/**
 * Check if a node is ready for schema propagation
 */
export async function isNodeReadyForSchemaPropagation(
  workflowId: string,
  nodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    if (!workflowId || !nodeId) return false;
    
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    let query = supabase
      .from('workflow_file_schemas')
      .select('columns')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId);
      
    if (sheetName) {
      query = query.eq('sheet_name', sheetName);
    }
    
    const { data, error } = await query.maybeSingle();
    
    if (error) {
      console.error('Error checking node readiness:', error);
      return false;
    }
    
    return !!(data && data.columns && data.columns.length > 0);
  } catch (err) {
    console.error('Exception in isNodeReadyForSchemaPropagation:', err);
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
    if (!workflowId || !sourceNodeId || !targetNodeId) return false;
    
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    // Check if source has schema
    const sourceReady = await isNodeReadyForSchemaPropagation(workflowId, sourceNodeId, sheetName);
    if (!sourceReady) {
      console.log(`Source node ${sourceNodeId} not ready for propagation`);
      return false;
    }
    
    // Check if target is missing schema
    const targetReady = await isNodeReadyForSchemaPropagation(workflowId, targetNodeId, sheetName);
    if (targetReady) {
      console.log(`Target node ${targetNodeId} already has schema`);
      return false;
    }
    
    console.log(`Propagation needed from ${sourceNodeId} to ${targetNodeId}`);
    return true;
  } catch (err) {
    console.error('Error in checkSchemaPropagationNeeded:', err);
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
    if (!workflowId || !sourceNodeId || !targetNodeId) return false;
    
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    // Get source node's selected sheet
    const { data: sourceData } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (!sourceData || !sourceData.metadata) {
      console.log('No metadata found for source node');
      return false;
    }
    
    // Type assertion to FileMetadata type to properly handle the metadata structure
    const sourceMetadata = sourceData.metadata as FileMetadata;
    const selectedSheet = sourceMetadata.selected_sheet;
    
    if (!selectedSheet) {
      console.log('No selected sheet found for source node');
      return false;
    }
    
    // Update target node's selected sheet
    const { data: targetData } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId)
      .maybeSingle();
      
    // Create a proper typed metadata object for the target
    let targetMetadata: FileMetadata = 
      (typeof targetData?.metadata === 'object' && !Array.isArray(targetData?.metadata)) 
        ? targetData?.metadata as FileMetadata 
        : {};
    
    targetMetadata.selected_sheet = selectedSheet;
    
    const { error: updateError } = await supabase
      .from('workflow_files')
      .update({ metadata: targetMetadata })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId);
      
    if (updateError) {
      console.error('Error updating target metadata:', updateError);
      return false;
    }
    
    // Propagate schema with the selected sheet
    return await propagateSchemaWithRetry(workflowId, sourceNodeId, targetNodeId, {
      sheetName: selectedSheet
    });
  } catch (err) {
    console.error('Error synchronizing sheet selection:', err);
    return false;
  }
}

/**
 * Get schema formatted for filtering operations
 */
export async function getSchemaForFiltering(
  workflowId: string,
  nodeId: string,
  options: {
    sheetName?: string;
    forceRefresh?: boolean;
  } = {}
): Promise<SchemaColumn[]> {
  const { sheetName, forceRefresh = false } = options;
  
  try {
    if (!workflowId || !nodeId) return [];
    
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    let query = supabase
      .from('workflow_file_schemas')
      .select('columns, data_types')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId);
      
    if (sheetName) {
      query = query.eq('sheet_name', sheetName);
    }
    
    const { data, error } = await query.maybeSingle();
    
    if (error) {
      console.error('Error fetching schema for filtering:', error);
      return [];
    }
    
    if (!data || !data.columns || data.columns.length === 0) {
      return [];
    }
    
    return data.columns.map(col => ({
      name: col,
      type: data.data_types[col] || 'unknown'
    }));
  } catch (error) {
    console.error('Error in getSchemaForFiltering:', error);
    return [];
  }
}

/**
 * Validate if schema is suitable for filtering operations
 */
export function validateSchemaForFiltering(
  schema: SchemaColumn[]
): SchemaColumn[] {
  // Filter out columns that can't be used for filtering
  return schema.filter(col => {
    // Remove columns with null, undefined, or complex types
    const invalidTypes = ['null', 'undefined', 'object', 'array', 'function'];
    return !invalidTypes.includes(col.type.toLowerCase());
  });
}

// Additional utilities as needed
