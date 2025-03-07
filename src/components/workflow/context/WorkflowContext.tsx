
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/types/workflow';
import { toast } from 'sonner';

// Interface for file schema data
export interface WorkflowFileSchema {
  id?: string;
  file_id: string;
  workflow_id: string;
  node_id: string;
  columns: string[];
  data_types: Json;
  sample_data: Json[];
  has_headers: boolean;
  sheet_name?: string | null;
  total_rows?: number | null;
  created_at?: string;
  updated_at?: string;
}

// Context type definition
interface WorkflowContextType {
  fileSchemas: Map<string, WorkflowFileSchema>;
  getFileSchema: (nodeId: string) => WorkflowFileSchema | undefined;
  saveFileSchema: (schema: WorkflowFileSchema) => Promise<WorkflowFileSchema | null>;
  updateFileSchema: (nodeId: string, updates: Partial<WorkflowFileSchema>) => Promise<WorkflowFileSchema | null>;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string) => Promise<boolean>;
  deleteFileSchema: (nodeId: string) => Promise<boolean>;
  loadFileSchemas: (workflowId: string) => Promise<Map<string, WorkflowFileSchema>>;
  isLoadingSchema: boolean;
}

// Create the context
const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

// Provider component
export const WorkflowProvider: React.FC<{ children: ReactNode; workflowId?: string }> = ({ 
  children, 
  workflowId 
}) => {
  const [fileSchemas, setFileSchemas] = useState<Map<string, WorkflowFileSchema>>(new Map());
  const [isLoadingSchema, setIsLoadingSchema] = useState<boolean>(false);

  // Load file schemas for a workflow
  const loadFileSchemas = useCallback(async (workflowId: string): Promise<Map<string, WorkflowFileSchema>> => {
    setIsLoadingSchema(true);
    try {
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .select('*')
        .eq('workflow_id', workflowId);

      if (error) {
        console.error('Error loading file schemas:', error);
        toast.error('Failed to load file data');
        return new Map();
      }

      const schemaMap = new Map<string, WorkflowFileSchema>();
      
      data.forEach(schema => {
        schemaMap.set(schema.node_id, schema);
      });

      setFileSchemas(schemaMap);
      return schemaMap;
    } catch (error) {
      console.error('Error in loadFileSchemas:', error);
      toast.error('An error occurred while loading file data');
      return new Map();
    } finally {
      setIsLoadingSchema(false);
    }
  }, []);

  // Initialize schemas when workflowId is provided
  React.useEffect(() => {
    if (workflowId) {
      loadFileSchemas(workflowId);
    }
  }, [workflowId, loadFileSchemas]);

  // Get file schema for a node
  const getFileSchema = useCallback((nodeId: string): WorkflowFileSchema | undefined => {
    return fileSchemas.get(nodeId);
  }, [fileSchemas]);

  // Save a new file schema
  const saveFileSchema = useCallback(async (schema: WorkflowFileSchema): Promise<WorkflowFileSchema | null> => {
    try {
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .insert(schema)
        .select()
        .single();

      if (error) {
        console.error('Error saving file schema:', error);
        toast.error('Failed to save file data');
        return null;
      }

      // Update local state
      setFileSchemas(prev => {
        const updated = new Map(prev);
        updated.set(schema.node_id, data);
        return updated;
      });

      return data;
    } catch (error) {
      console.error('Error in saveFileSchema:', error);
      toast.error('An error occurred while saving file data');
      return null;
    }
  }, []);

  // Update an existing file schema
  const updateFileSchema = useCallback(async (
    nodeId: string, 
    updates: Partial<WorkflowFileSchema>
  ): Promise<WorkflowFileSchema | null> => {
    const existingSchema = fileSchemas.get(nodeId);
    
    if (!existingSchema) {
      console.error('Cannot update non-existent schema for node:', nodeId);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .update(updates)
        .eq('id', existingSchema.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating file schema:', error);
        toast.error('Failed to update file data');
        return null;
      }

      // Update local state
      setFileSchemas(prev => {
        const updated = new Map(prev);
        updated.set(nodeId, data);
        return updated;
      });

      return data;
    } catch (error) {
      console.error('Error in updateFileSchema:', error);
      toast.error('An error occurred while updating file data');
      return null;
    }
  }, [fileSchemas]);

  // Propagate file schema from one node to another
  const propagateFileSchema = useCallback(async (
    sourceNodeId: string, 
    targetNodeId: string
  ): Promise<boolean> => {
    const sourceSchema = fileSchemas.get(sourceNodeId);
    
    if (!sourceSchema) {
      console.error('Source node has no schema:', sourceNodeId);
      return false;
    }

    try {
      // Create a new schema for the target node based on the source schema
      const newSchema: WorkflowFileSchema = {
        file_id: sourceSchema.file_id,
        workflow_id: sourceSchema.workflow_id,
        node_id: targetNodeId,
        columns: sourceSchema.columns,
        data_types: sourceSchema.data_types,
        sample_data: sourceSchema.sample_data,
        has_headers: sourceSchema.has_headers,
        sheet_name: sourceSchema.sheet_name,
        total_rows: sourceSchema.total_rows
      };

      // Check if target already has a schema
      const existingTargetSchema = fileSchemas.get(targetNodeId);
      
      if (existingTargetSchema) {
        // Update existing schema
        await updateFileSchema(targetNodeId, newSchema);
      } else {
        // Create new schema
        await saveFileSchema(newSchema);
      }

      return true;
    } catch (error) {
      console.error('Error propagating schema:', error);
      return false;
    }
  }, [fileSchemas, saveFileSchema, updateFileSchema]);

  // Delete a file schema
  const deleteFileSchema = useCallback(async (nodeId: string): Promise<boolean> => {
    const schema = fileSchemas.get(nodeId);
    
    if (!schema || !schema.id) {
      // If there's no schema stored, consider it "deleted"
      return true;
    }

    try {
      const { error } = await supabase
        .from('workflow_file_schemas')
        .delete()
        .eq('id', schema.id);

      if (error) {
        console.error('Error deleting file schema:', error);
        toast.error('Failed to delete file data');
        return false;
      }

      // Update local state
      setFileSchemas(prev => {
        const updated = new Map(prev);
        updated.delete(nodeId);
        return updated;
      });

      return true;
    } catch (error) {
      console.error('Error in deleteFileSchema:', error);
      toast.error('An error occurred while deleting file data');
      return false;
    }
  }, [fileSchemas]);

  // Context value
  const contextValue: WorkflowContextType = {
    fileSchemas,
    getFileSchema,
    saveFileSchema,
    updateFileSchema,
    propagateFileSchema,
    deleteFileSchema,
    loadFileSchemas,
    isLoadingSchema
  };

  return (
    <WorkflowContext.Provider value={contextValue}>
      {children}
    </WorkflowContext.Provider>
  );
};

// Custom hook
export const useWorkflow = (): WorkflowContextType => {
  const context = useContext(WorkflowContext);
  
  if (context === undefined) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  
  return context;
};
