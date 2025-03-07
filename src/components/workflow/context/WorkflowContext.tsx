
import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/types/workflow';

// Define the file schema interface
export interface WorkflowFileSchema {
  id?: string;
  workflow_id: string;
  node_id: string;
  file_id: string;
  columns: string[];
  data_types: Json;
  sample_data?: Json[];
  has_headers: boolean;
  sheet_name?: string | null;
  total_rows?: number;
}

interface WorkflowContextType {
  workflowId?: string;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string) => Promise<void>;
  getFileSchema?: (fileId: string) => Promise<WorkflowFileSchema | null>;
  saveFileSchema?: (schema: WorkflowFileSchema) => Promise<boolean>;
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

  // Get file schema for a specific file in the workflow
  const getFileSchema = useCallback(async (fileId: string): Promise<WorkflowFileSchema | null> => {
    if (!workflowId) return null;
    
    try {
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('file_id', fileId)
        .maybeSingle();
        
      if (error) {
        console.error('Error fetching file schema:', error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Error in getFileSchema:', error);
      return null;
    }
  }, [workflowId]);

  // Save or update file schema
  const saveFileSchema = useCallback(async (schema: WorkflowFileSchema): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('workflow_file_schemas')
        .upsert({
          ...schema,
          workflow_id: workflowId || schema.workflow_id
        }, {
          onConflict: 'workflow_id,file_id,node_id'
        });
        
      if (error) {
        console.error('Error saving file schema:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error in saveFileSchema:', error);
      return false;
    }
  }, [workflowId]);

  return (
    <WorkflowContext.Provider value={{
      workflowId,
      propagateFileSchema,
      getFileSchema,
      saveFileSchema,
    }}>
      {children}
    </WorkflowContext.Provider>
  );
};

export const useWorkflow = () => useContext(WorkflowContext);
