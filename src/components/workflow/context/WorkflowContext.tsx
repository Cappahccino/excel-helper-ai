
import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase, convertToDbWorkflowId, isTemporaryWorkflowId, formatWorkflowId } from '@/integrations/supabase/client';
import { schemaUtils } from '@/utils/schemaUtils';
import { toast } from 'sonner';

export interface WorkflowContextType {
  workflowId?: string;
  isTemporaryId: (id: string) => boolean;
  convertToDbWorkflowId: (id: string) => string;
  formatWorkflowId: (id: string, temporary: boolean) => string;
  migrateTemporaryWorkflow: (oldId: string, newId: string) => Promise<boolean>;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string) => Promise<boolean>;
}

const WorkflowContext = createContext<WorkflowContextType>({
  isTemporaryId: isTemporaryWorkflowId,
  convertToDbWorkflowId,
  formatWorkflowId,
  migrateTemporaryWorkflow: async () => false,
  propagateFileSchema: async () => false,
});

export const useWorkflow = () => useContext(WorkflowContext);

interface WorkflowProviderProps {
  children: React.ReactNode;
  workflowId?: string;
}

export const WorkflowProvider: React.FC<WorkflowProviderProps> = ({ 
  children, 
  workflowId 
}) => {
  // Migrate temporary workflow to permanent
  const migrateTemporaryWorkflow = useCallback(async (oldId: string, newId: string): Promise<boolean> => {
    if (!oldId || !newId) {
      console.error('Missing ID for workflow migration');
      return false;
    }
    
    try {
      console.log(`Migrating workflow from ${oldId} to ${newId}`);
      
      // Convert oldId to database format
      const dbOldId = convertToDbWorkflowId(oldId);
      const dbNewId = convertToDbWorkflowId(newId);
      
      // First check if the new ID already exists
      const { data: existingWorkflow, error: checkError } = await supabase
        .from('workflows')
        .select('id')
        .eq('id', dbNewId)
        .maybeSingle();
        
      if (checkError) {
        console.error('Error checking for existing workflow:', checkError);
        return false;
      }
      
      if (existingWorkflow) {
        console.log(`Workflow with ID ${dbNewId} already exists, skipping migration`);
        return true;
      }
      
      // Create new workflow with the same data
      const { data: oldWorkflow, error: fetchError } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', dbOldId)
        .maybeSingle();
        
      if (fetchError) {
        console.error('Error fetching old workflow:', fetchError);
        return false;
      }
      
      if (!oldWorkflow) {
        console.error(`Old workflow with ID ${dbOldId} not found`);
        return false;
      }
      
      // Insert new workflow
      const { error: insertError } = await supabase
        .from('workflows')
        .insert({
          ...oldWorkflow,
          id: dbNewId,
          is_temporary: false
        });
        
      if (insertError) {
        console.error('Error inserting new workflow:', insertError);
        return false;
      }
      
      // Migrate related records
      
      // 1. Workflow edges
      const { data: edges, error: edgesError } = await supabase
        .from('workflow_edges')
        .select('*')
        .eq('workflow_id', dbOldId);
        
      if (edgesError) {
        console.error('Error fetching workflow edges:', edgesError);
      } else if (edges && edges.length > 0) {
        // Insert edges with new workflow ID
        const newEdges = edges.map(edge => ({
          ...edge,
          id: undefined, // Allow DB to generate new ID
          workflow_id: dbNewId
        }));
        
        const { error: insertEdgesError } = await supabase
          .from('workflow_edges')
          .insert(newEdges);
          
        if (insertEdgesError) {
          console.error('Error migrating workflow edges:', insertEdgesError);
        }
      }
      
      // 2. Workflow files
      const { data: files, error: filesError } = await supabase
        .from('workflow_files')
        .select('*')
        .eq('workflow_id', dbOldId);
        
      if (filesError) {
        console.error('Error fetching workflow files:', filesError);
      } else if (files && files.length > 0) {
        // Insert files with new workflow ID
        const newFiles = files.map(file => ({
          ...file,
          id: undefined, // Allow DB to generate new ID
          workflow_id: dbNewId,
          is_temporary: false
        }));
        
        const { error: insertFilesError } = await supabase
          .from('workflow_files')
          .insert(newFiles);
          
        if (insertFilesError) {
          console.error('Error migrating workflow files:', insertFilesError);
        }
      }
      
      // 3. Workflow file schemas
      const { data: schemas, error: schemasError } = await supabase
        .from('workflow_file_schemas')
        .select('*')
        .eq('workflow_id', dbOldId);
        
      if (schemasError) {
        console.error('Error fetching workflow file schemas:', schemasError);
      } else if (schemas && schemas.length > 0) {
        // Insert schemas with new workflow ID
        const newSchemas = schemas.map(schema => ({
          ...schema,
          id: undefined, // Allow DB to generate new ID
          workflow_id: dbNewId,
          is_temporary: false
        }));
        
        const { error: insertSchemasError } = await supabase
          .from('workflow_file_schemas')
          .insert(newSchemas);
          
        if (insertSchemasError) {
          console.error('Error migrating workflow file schemas:', insertSchemasError);
        }
      }
      
      // Mark the migration as successful
      return true;
    } catch (error) {
      console.error('Error in migrateTemporaryWorkflow:', error);
      return false;
    }
  }, []);

  // Propagate file schema from source to target node
  const propagateFileSchema = useCallback(async (sourceNodeId: string, targetNodeId: string): Promise<boolean> => {
    if (!workflowId || !sourceNodeId || !targetNodeId) {
      console.error('Missing required parameters for propagateFileSchema');
      return false;
    }
    
    try {
      console.log(`Propagating file schema from ${sourceNodeId} to ${targetNodeId}`);
      
      const result = await schemaUtils.propagateSchema(workflowId, sourceNodeId, targetNodeId);
      
      if (result) {
        console.log('Schema propagation successful');
      } else {
        console.warn('Schema propagation may have failed');
      }
      
      return result;
    } catch (error) {
      console.error('Error propagating file schema:', error);
      toast.error('Failed to propagate schema between nodes');
      return false;
    }
  }, [workflowId]);
  
  // Create the context value object
  const contextValue = {
    workflowId,
    isTemporaryId: isTemporaryWorkflowId,
    convertToDbWorkflowId,
    formatWorkflowId,
    migrateTemporaryWorkflow,
    propagateFileSchema
  };
  
  return (
    <WorkflowContext.Provider value={contextValue}>
      {children}
    </WorkflowContext.Provider>
  );
};
