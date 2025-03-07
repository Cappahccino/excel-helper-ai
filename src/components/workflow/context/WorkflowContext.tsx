
import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FileSchema {
  columns: string[];
  data_types: Record<string, string>;
  sample_data?: any[];
}

interface WorkflowContextType {
  workflowId?: string;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string) => Promise<void>;
}

const WorkflowContext = createContext<WorkflowContextType>({
  propagateFileSchema: async () => {},
});

export const WorkflowProvider: React.FC<{
  children: React.ReactNode;
  workflowId?: string;
}> = ({ children, workflowId }) => {
  // Propagate file schema from source node to target node
  const propagateFileSchema = useCallback(async (sourceNodeId: string, targetNodeId: string) => {
    if (!workflowId) return;
    
    try {
      // Find schema associated with source node
      const { data: sourceSchemas, error: sourceError } = await supabase
        .from('workflow_file_schemas')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('node_id', sourceNodeId);
      
      if (sourceError) {
        console.error('Error fetching source schemas:', sourceError);
        return;
      }
      
      // If no schemas found for source node, nothing to propagate
      if (!sourceSchemas || sourceSchemas.length === 0) {
        return;
      }
      
      // For each file schema in the source node
      for (const schema of sourceSchemas) {
        // Check if target node already has this schema
        const { data: existingSchema, error: existingError } = await supabase
          .from('workflow_file_schemas')
          .select('id')
          .eq('workflow_id', workflowId)
          .eq('node_id', targetNodeId)
          .eq('file_id', schema.file_id)
          .maybeSingle();
          
        if (existingError) {
          console.error('Error checking existing schema:', existingError);
          continue;
        }
        
        // If target node doesn't have this schema, propagate it
        if (!existingSchema) {
          const { error: insertError } = await supabase
            .from('workflow_file_schemas')
            .insert({
              workflow_id: workflowId,
              file_id: schema.file_id,
              node_id: targetNodeId,
              columns: schema.columns,
              data_types: schema.data_types,
              sample_data: schema.sample_data,
              has_headers: schema.has_headers
            });
            
          if (insertError) {
            console.error('Error propagating schema:', insertError);
          }
        }
      }
    } catch (error) {
      console.error('Error in propagateFileSchema:', error);
    }
  }, [workflowId]);

  return (
    <WorkflowContext.Provider value={{
      workflowId,
      propagateFileSchema,
    }}>
      {children}
    </WorkflowContext.Provider>
  );
};

export const useWorkflow = () => useContext(WorkflowContext);
