
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/utils/schemaUtils';

interface WorkflowFileSchema {
  workflow_id: string;
  node_id: string;
  columns: string[];
  data_types: Record<string, string>;
  sample_data?: any[];
  has_headers: boolean;
  file_id: string;
}

export async function getFileSchema(workflowId: string, nodeId: string): Promise<SchemaColumn[]> {
  try {
    // Format workflowId for database
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Get schema from workflow_file_schemas
    const { data, error } = await supabase
      .from('workflow_file_schemas')
      .select('data_types, columns')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching file schema:', error);
      return [];
    }
    
    if (!data || !data.data_types || !data.columns) {
      console.log('No schema found for node:', nodeId);
      return [];
    }
    
    // Convert data_types to SchemaColumn[]
    try {
      const dataTypes = data.data_types;
      const columns = data.columns;
      
      const schema: SchemaColumn[] = columns.map(col => ({
        name: col,
        type: dataTypes[col] || 'string'
      }));
      
      return schema;
    } catch (e) {
      console.error('Error parsing schema:', e);
      return [];
    }
  } catch (error) {
    console.error('Error in getFileSchema:', error);
    return [];
  }
}

export async function saveFileSchema(
  workflowId: string, 
  nodeId: string, 
  schema: SchemaColumn[], 
  fileId: string
): Promise<boolean> {
  try {
    // Format workflowId for database
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Convert SchemaColumn[] to columns and data_types
    const columns = schema.map(col => col.name);
    const dataTypes: Record<string, string> = {};
    
    schema.forEach(col => {
      dataTypes[col.name] = col.type;
    });
    
    // Check if schema already exists
    const { data: existingSchema, error: checkError } = await supabase
      .from('workflow_file_schemas')
      .select('id')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
    
    if (checkError) {
      console.error('Error checking existing schema:', checkError);
    }
    
    if (existingSchema) {
      // Update existing schema
      const { error } = await supabase
        .from('workflow_file_schemas')
        .update({
          columns,
          data_types: dataTypes,
          file_id: fileId,
          has_headers: true
        })
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId);
      
      if (error) {
        console.error('Error updating file schema:', error);
        return false;
      }
      
      return true;
    } else {
      // Create new schema
      const { error } = await supabase
        .from('workflow_file_schemas')
        .insert({
          workflow_id: dbWorkflowId,
          node_id: nodeId,
          columns,
          data_types: dataTypes,
          file_id: fileId,
          has_headers: true
        });
      
      if (error) {
        console.error('Error creating file schema:', error);
        return false;
      }
      
      return true;
    }
  } catch (error) {
    console.error('Error in saveFileSchema:', error);
    return false;
  }
}
