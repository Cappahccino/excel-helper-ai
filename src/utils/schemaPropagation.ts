
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';

/**
 * Normalize workflow ID by removing 'temp-' prefix if needed
 */
export function normalizeWorkflowId(workflowId: string): string {
  if (workflowId.startsWith('temp-')) {
    return workflowId.substring(5);
  }
  return workflowId;
}

/**
 * Directly propagate schema from source node to target node
 * This ensures immediate propagation when an edge is created
 */
export async function propagateSchemaDirectly(
  workflowId: string,
  sourceNodeId: string, 
  targetNodeId: string
): Promise<boolean> {
  try {
    console.log(`Direct schema propagation: ${sourceNodeId} -> ${targetNodeId}`);
    
    // Normalize the workflow ID
    const dbWorkflowId = normalizeWorkflowId(workflowId);
    
    // 1. First, get the schema from the source node
    const { data: sourceSchema, error: sourceError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, file_id')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (sourceError) {
      console.error('Error fetching source schema:', sourceError);
      return false;
    }
    
    if (!sourceSchema) {
      console.log(`No schema found for source node ${sourceNodeId}`);
      return false;
    }
    
    // 2. Now propagate to the target node
    const { error: targetError } = await supabase
      .from('workflow_file_schemas')
      .upsert({
        workflow_id: dbWorkflowId,
        node_id: targetNodeId,
        file_id: sourceSchema.file_id || '00000000-0000-0000-0000-000000000000',
        columns: sourceSchema.columns,
        data_types: sourceSchema.data_types,
        updated_at: new Date().toISOString(),
        is_temporary: false
      }, {
        onConflict: 'workflow_id,node_id'
      });
      
    if (targetError) {
      console.error('Error propagating schema to target node:', targetError);
      return false;
    }
    
    console.log(`Successfully propagated schema from ${sourceNodeId} to ${targetNodeId}`);
    return true;
  } catch (error) {
    console.error('Error in direct schema propagation:', error);
    return false;
  }
}

/**
 * Convert schema columns to the format needed for workflow_file_schemas
 */
export function convertSchemaColumnsToDbFormat(schema: SchemaColumn[]) {
  const columns = schema.map(col => col.name);
  const dataTypes = schema.reduce((acc, col) => {
    acc[col.name] = col.type;
    return acc;
  }, {} as Record<string, string>);
  
  return { columns, dataTypes };
}

/**
 * Convert database schema format to SchemaColumn[]
 */
export function convertDbSchemaToColumns(
  columns: string[], 
  dataTypes: Record<string, string>
): SchemaColumn[] {
  return columns.map(column => ({
    name: column,
    type: dataTypes[column] as 'string' | 'text' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown'
  }));
}
