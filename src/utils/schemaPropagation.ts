import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';

interface NodeMetadata {
  selected_sheet?: string;
  sheets?: Array<{
    name: string;
    index: number;
    rowCount?: number;
    isDefault?: boolean;
  }>;
  [key: string]: any;
}

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
    
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    const { data: sourceSchema, error: sourceError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, file_id, sheet_name')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .is('is_temporary', false);
      
    if (sourceError || !sourceSchema || sourceSchema.length === 0) {
      console.error('Error or no schema found for source node:', sourceError || 'No schema found');
      return false;
    }
    
    let schema = sourceSchema[0];
    
    if (sheetName && sourceSchema.length > 1) {
      const sheetSchema = sourceSchema.find(s => s.sheet_name === sheetName);
      if (sheetSchema) {
        schema = sheetSchema;
      }
    }
    
    const targetSchema = {
      workflow_id: dbWorkflowId,
      node_id: targetNodeId,
      columns: schema.columns,
      data_types: schema.data_types,
      file_id: schema.file_id,
      sheet_name: sheetName || schema.sheet_name || 'Sheet1',
      has_headers: true,
      updated_at: new Date().toISOString()
    };
    
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
    
    const { data: schema, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, sheet_name')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .is('is_temporary', false);
      
    if (error || !schema || schema.length === 0) {
      console.error('No schema found for node:', nodeId);
      return [];
    }
    
    let targetSchema = schema[0];
    if (sheetName && schema.length > 1) {
      const sheetSchema = schema.find(s => s.sheet_name === sheetName);
      if (sheetSchema) {
        targetSchema = sheetSchema;
      }
    }
    
    return targetSchema.columns.map(column => ({
      name: column,
      type: targetSchema.data_types[column] || 'unknown'
    }));
  } catch (error) {
    console.error('Error in forceSchemaRefresh:', error);
    return [];
  }
}

/**
 * Check if schema propagation is needed between nodes
 */
export async function checkSchemaPropagationNeeded(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string
): Promise<boolean> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    const { data: sourceSchema, error: sourceError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (sourceError || !sourceSchema) {
      console.log(`No source schema available for ${sourceNodeId}`);
      return false;
    }
    
    const { data: targetSchema, error: targetError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId)
      .maybeSingle();
      
    if (targetError) {
      console.error(`Error checking target schema for ${targetNodeId}:`, targetError);
      return true;
    }
    
    if (!targetSchema) {
      console.log(`No target schema exists for ${targetNodeId}, propagation needed`);
      return true;
    }
    
    const sourceColumns = sourceSchema.columns || [];
    const targetColumns = targetSchema.columns || [];
    
    if (sourceColumns.length !== targetColumns.length) {
      console.log(`Column counts differ: source=${sourceColumns.length}, target=${targetColumns.length}`);
      return true;
    }
    
    for (const column of sourceColumns) {
      if (!targetColumns.includes(column)) {
        console.log(`Column ${column} exists in source but not in target`);
        return true;
      }
      
      if (sourceSchema.data_types[column] !== targetSchema.data_types[column]) {
        console.log(`Data type mismatch for column ${column}`);
        return true;
      }
    }
    
    console.log(`Schemas match between ${sourceNodeId} and ${targetNodeId}, no propagation needed`);
    return false;
  } catch (error) {
    console.error('Error in checkSchemaPropagationNeeded:', error);
    return true;
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
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    const { data: sourceNodeConfig } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (!sourceNodeConfig?.metadata) {
      console.log(`No metadata found for source node ${sourceNodeId}`);
      return false;
    }
    
    const metadata = sourceNodeConfig.metadata as NodeMetadata;
    
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || !metadata.selected_sheet) {
      console.log(`No selected sheet found for source node ${sourceNodeId}`);
      return false;
    }
    
    const selectedSheet = metadata.selected_sheet;
    
    const { data: targetNodeConfig } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId)
      .maybeSingle();
      
    let targetMetadata: NodeMetadata;
    
    if (targetNodeConfig?.metadata && typeof targetNodeConfig.metadata === 'object' && !Array.isArray(targetNodeConfig.metadata)) {
      targetMetadata = { ...targetNodeConfig.metadata as NodeMetadata };
    } else {
      targetMetadata = {};
    }
    
    targetMetadata.selected_sheet = selectedSheet;
    
    const { error } = await supabase
      .from('workflow_files')
      .update({ metadata: targetMetadata })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId);
      
    if (error) {
      console.error(`Error updating target node ${targetNodeId} sheet selection:`, error);
      return false;
    }
    
    console.log(`Successfully synchronized sheet selection from ${sourceNodeId} to ${targetNodeId}`);
    return true;
  } catch (error) {
    console.error('Error in synchronizeNodesSheetSelection:', error);
    return false;
  }
}
