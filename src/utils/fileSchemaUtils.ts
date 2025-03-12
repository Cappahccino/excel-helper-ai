
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { WorkflowFileSchema } from '@/components/workflow/context/WorkflowContext';

/**
 * Converts a WorkflowFileSchema to SchemaColumn[] format for node schema handling
 */
export function convertFileSchemaToSchemaColumns(fileSchema: WorkflowFileSchema | null): SchemaColumn[] {
  if (!fileSchema) return [];
  
  return fileSchema.columns.map(columnName => {
    const dataType = fileSchema.types[columnName] || 'string';
    
    // Map data types to supported column types
    let type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown' = 'string';
    
    if (dataType.includes('int') || dataType.includes('float') || dataType.includes('double') || dataType.includes('decimal') || dataType.includes('number')) {
      type = 'number';
    } else if (dataType.includes('bool')) {
      type = 'boolean';
    } else if (dataType.includes('date') || dataType.includes('time')) {
      type = 'date';
    } else if (dataType.includes('object')) {
      type = 'object';
    } else if (dataType.includes('array')) {
      type = 'array';
    }
    
    return {
      name: columnName,
      type
    };
  });
}

/**
 * Retrieves file schema from database
 */
export async function getFileSchemaFromDb(fileId: string): Promise<WorkflowFileSchema | null> {
  try {
    const { data: metaData, error: metaError } = await supabase
      .from('file_metadata')
      .select('column_definitions, headers')
      .eq('file_id', fileId)
      .maybeSingle();
    
    if (metaError || !metaData) {
      console.error('Error retrieving file schema:', metaError);
      return null;
    }
    
    // Use headers if available, otherwise extract from column_definitions
    const columns = metaData.headers || 
      (metaData.column_definitions ? Object.keys(metaData.column_definitions) : []);
    
    return {
      columns,
      types: metaData.column_definitions || {}
    };
  } catch (error) {
    console.error('Error in getFileSchemaFromDb:', error);
    return null;
  }
}

/**
 * Updates the schema for a workflow node in the database
 */
export async function updateNodeSchemaInDb(
  workflowId: string,
  nodeId: string,
  schema: SchemaColumn[]
): Promise<boolean> {
  try {
    const columns = schema.map(col => col.name);
    const dataTypes: Record<string, string> = {};
    
    schema.forEach(col => {
      dataTypes[col.name] = col.type;
    });
    
    const { error } = await supabase
      .from('workflow_file_schemas')
      .upsert({
        workflow_id: workflowId,
        node_id: nodeId,
        columns,
        data_types: dataTypes,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_id,node_id'
      });
    
    if (error) {
      console.error('Error updating node schema:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in updateNodeSchemaInDb:', error);
    return false;
  }
}
