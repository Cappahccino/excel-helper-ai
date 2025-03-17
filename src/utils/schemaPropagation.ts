
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';

/**
 * Propagate schema directly from source to target node
 */
export async function propagateSchemaDirectly(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    console.log(`Propagating schema: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName || 'default'}`);
    
    // Convert temporary workflow ID if needed
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // First, get source node schema
    const { data: sourceSchema, error: sourceError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, file_id')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .is('is_temporary', false);
      
    if (sourceError || !sourceSchema || sourceSchema.length === 0) {
      console.error('Error or no schema found for source node:', sourceError || 'No schema found');
      return false;
    }
    
    // If multiple schemas exist (e.g., multiple sheets), try to find the right one
    let schema = sourceSchema[0];
    
    if (sheetName && sourceSchema.length > 1) {
      // Try to find the specific sheet
      const sheetSchema = sourceSchema.find(s => s.sheet_name === sheetName);
      if (sheetSchema) {
        schema = sheetSchema;
      }
    }
    
    // Create target schema from source schema
    const targetSchema = {
      workflow_id: dbWorkflowId,
      node_id: targetNodeId,
      columns: schema.columns,
      data_types: schema.data_types,
      file_id: schema.file_id,
      sheet_name: sheetName || 'Sheet1',
      has_headers: true,
      updated_at: new Date().toISOString()
    };
    
    // Update target schema in database
    const { error: targetError } = await supabase
      .from('workflow_file_schemas')
      .upsert(targetSchema, {
        onConflict: 'workflow_id,node_id,sheet_name'
      });
      
    if (targetError) {
      console.error('Error updating target schema:', targetError);
      return false;
    }
    
    console.log(`Schema successfully propagated from ${sourceNodeId} to ${targetNodeId}`);
    return true;
  } catch (error) {
    console.error('Error in propagateSchemaDirectly:', error);
    return false;
  }
}

/**
 * Check if a node is ready for schema propagation
 */
export async function isNodeReadyForSchemaPropagation(
  workflowId: string,
  nodeId: string
): Promise<boolean> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Check if node has schema available
    const { data: schema, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    if (error) {
      console.error('Error checking node readiness:', error);
      return false;
    }
    
    // Node is ready if it has schema with columns
    return !!schema && Array.isArray(schema.columns) && schema.columns.length > 0;
  } catch (error) {
    console.error('Error in isNodeReadyForSchemaPropagation:', error);
    return false;
  }
}

/**
 * Force refresh schema for a node from source
 */
export async function forceSchemaRefresh(
  workflowId: string,
  nodeId: string,
  sheetName?: string
): Promise<SchemaColumn[]> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Fetch node schema
    const { data: schema, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .is('is_temporary', false);
      
    if (error || !schema || schema.length === 0) {
      console.error('No schema found for node:', nodeId);
      return [];
    }
    
    // Find schema for specific sheet if specified
    let targetSchema = schema[0];
    if (sheetName && schema.length > 1) {
      const sheetSchema = schema.find(s => s.sheet_name === sheetName);
      if (sheetSchema) {
        targetSchema = sheetSchema;
      }
    }
    
    // Convert to SchemaColumn format
    return targetSchema.columns.map(column => ({
      name: column,
      type: targetSchema.data_types[column] || 'unknown'
    }));
  } catch (error) {
    console.error('Error in forceSchemaRefresh:', error);
    return [];
  }
}
