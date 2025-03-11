import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn, WorkflowFileSchema } from '@/types/workflow';

export const fileSchemaUtils = {
  async getSchema(workflowId: string, nodeId: string): Promise<SchemaColumn[]> {
    try {
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .select('schema')
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      if (error) {
        console.error('Error fetching schema:', error);
        return [];
      }
      
      if (data && data.schema && data.schema.columns) {
        return data.schema.columns;
      }
      
      return [];
    } catch (error) {
      console.error('Error in getSchema:', error);
      return [];
    }
  },
  
  async saveSchema(workflowId: string, nodeId: string, columns: SchemaColumn[]): Promise<boolean> {
    try {
      const schema = { columns };
      
      // Check if schema already exists
      const { data: existingSchema, error: checkError } = await supabase
        .from('workflow_file_schemas')
        .select('id')
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      if (checkError) {
        console.error('Error checking for existing schema:', checkError);
        return false;
      }
      
      if (existingSchema) {
        // Update existing schema
        const { error: updateError } = await supabase
          .from('workflow_file_schemas')
          .update({ schema })
          .eq('workflow_id', workflowId)
          .eq('node_id', nodeId);
          
        if (updateError) {
          console.error('Error updating schema:', updateError);
          return false;
        }
      } else {
        // Insert new schema
        const { error: insertError } = await supabase
          .from('workflow_file_schemas')
          .insert({
            workflow_id: workflowId,
            node_id: nodeId,
            schema
          });
          
        if (insertError) {
          console.error('Error inserting schema:', insertError);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error in saveSchema:', error);
      return false;
    }
  }
};
