
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/types/workflow';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { WorkflowFileSchema } from '@/components/workflow/context/WorkflowContext';

export async function getFileMetadata(fileId: string): Promise<WorkflowFileSchema | null> {
  try {
    const { data: metaData, error: metaError } = await supabase
      .from('file_metadata')
      .select('column_definitions')
      .eq('file_id', fileId)
      .maybeSingle();
      
    if (metaError || !metaData?.column_definitions) {
      console.error('Error fetching file metadata:', metaError);
      return null;
    }
    
    return {
      columns: Object.keys(metaData.column_definitions),
      types: metaData.column_definitions as Record<string, string>
    };
  } catch (error) {
    console.error('Error in getFileMetadata:', error);
    return null;
  }
}

export async function updateNodeSchema(
  workflowId: string,
  nodeId: string,
  fileId: string,
  schema: WorkflowFileSchema
): Promise<boolean> {
  try {
    console.log(`Updating schema for node ${nodeId} in workflow ${workflowId}`);
    console.log('Schema data:', schema);
    
    const { error } = await supabase
      .from('workflow_file_schemas')
      .upsert({
        workflow_id: workflowId,
        node_id: nodeId,
        file_id: fileId,
        columns: schema.columns,
        data_types: schema.types,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_id,node_id'
      });
      
    if (error) {
      console.error('Error updating node schema:', error);
      return false;
    }
    
    console.log(`Schema updated successfully for node ${nodeId}`);
    return true;
  } catch (error) {
    console.error('Error in updateNodeSchema:', error);
    return false;
  }
}

/**
 * Convert WorkflowFileSchema to SchemaColumn array
 */
export function convertToSchemaColumns(schema: WorkflowFileSchema): SchemaColumn[] {
  return schema.columns.map(column => ({
    name: column,
    type: schema.types[column] as 'string' | 'text' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown'
  }));
}

/**
 * Propagate schema between connected nodes
 */
export async function propagateSchema(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  schema: SchemaColumn[]
): Promise<boolean> {
  try {
    console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId}`);
    
    // Convert SchemaColumn array to workflow_file_schemas format
    const columns = schema.map(col => col.name);
    const dataTypes = schema.reduce((acc, col) => {
      acc[col.name] = col.type;
      return acc;
    }, {} as Record<string, string>);
    
    const { error } = await supabase
      .from('workflow_file_schemas')
      .upsert({
        workflow_id: workflowId,
        node_id: targetNodeId,
        file_id: '00000000-0000-0000-0000-000000000000', // Placeholder for propagated schema
        columns,
        data_types: dataTypes,
        is_temporary: false,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_id,node_id'
      });
      
    if (error) {
      console.error('Error propagating schema:', error);
      return false;
    }
    
    console.log(`Schema propagated successfully to ${targetNodeId}`);
    return true;
  } catch (error) {
    console.error('Error in propagateSchema:', error);
    return false;
  }
}
