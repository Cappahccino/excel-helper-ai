
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/types/workflow';
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
    const { error } = await supabase
      .from('workflow_file_schemas')
      .insert({
        workflow_id: workflowId,
        node_id: nodeId,
        file_id: fileId,
        columns: schema.columns,
        data_types: schema.types,
        updated_at: new Date().toISOString()
      });
      
    if (error) {
      console.error('Error updating node schema:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in updateNodeSchema:', error);
    return false;
  }
}
