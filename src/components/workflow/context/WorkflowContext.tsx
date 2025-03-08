
import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/types/workflow';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/useDebounce';

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
  isTemporaryId: boolean;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string) => Promise<void>;
  getFileSchema: (nodeId: string) => Promise<WorkflowFileSchema | null>;
  saveFileSchema: (schema: WorkflowFileSchema) => Promise<boolean>;
  migrateTemporaryWorkflow: (tempId: string, permanentId: string) => Promise<boolean>;
  convertToDbWorkflowId: (id: string) => string;
}

const WorkflowContext = createContext<WorkflowContextType>({
  isTemporaryId: false,
  propagateFileSchema: async () => {},
  getFileSchema: async () => null,
  saveFileSchema: async () => false,
  migrateTemporaryWorkflow: async () => false,
  convertToDbWorkflowId: (id) => id,
});

export const WorkflowProvider: React.FC<{
  children: React.ReactNode;
  workflowId?: string;
}> = ({ children, workflowId }) => {
  const [migrationInProgress, setMigrationInProgress] = useState<boolean>(false);
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const isTemporaryId = workflowId ? workflowId.startsWith('temp-') : false;
  const debouncedMigrationStatus = useDebounce(migrationStatus, 300);
  
  // Convert a temporary workflow ID to a UUID for database operations
  const convertToDbWorkflowId = useCallback((id: string): string => {
    if (!id) return id;
    
    // If it's a temporary ID, extract the UUID part after 'temp-'
    if (id.startsWith('temp-')) {
      return id.substring(5); // Remove 'temp-' prefix to get the UUID
    }
    
    // Already a UUID, return as-is
    return id;
  }, []);
  
  // Migrate data from a temporary workflow ID to a permanent one
  const migrateTemporaryWorkflow = useCallback(async (tempId: string, permanentId: string): Promise<boolean> => {
    if (!tempId || !permanentId || !tempId.startsWith('temp-')) {
      console.error('Invalid migration: Source must be temporary ID and target must be permanent');
      return false;
    }
    
    try {
      setMigrationInProgress(true);
      setMigrationStatus('pending');
      console.log(`Migrating workflow data from ${tempId} to ${permanentId}`);
      
      // Extract the UUID part of the temporary ID
      const tempUuid = convertToDbWorkflowId(tempId);
      
      // 1. Migrate file schemas
      const { data: schemas, error: schemasError } = await supabase
        .from('workflow_file_schemas')
        .select('*')
        .eq('workflow_id', tempUuid);
        
      if (schemasError) {
        console.error('Error fetching schemas to migrate:', schemasError);
        throw new Error(`Schema fetch failed: ${schemasError.message}`);
      }
      
      if (schemas && schemas.length > 0) {
        // Update workflow_id in all schemas
        const updates = schemas.map(schema => ({
          ...schema,
          workflow_id: permanentId,
          id: undefined // Let the database generate new IDs
        }));
        
        const { error: updateError } = await supabase
          .from('workflow_file_schemas')
          .upsert(updates, { 
            onConflict: 'workflow_id,node_id,file_id',
            ignoreDuplicates: false
          });
          
        if (updateError) {
          console.error('Error migrating schemas:', updateError);
          throw new Error(`Schema migration failed: ${updateError.message}`);
        }
      }
      
      // 2. Migrate workflow files
      const { data: files, error: filesError } = await supabase
        .from('workflow_files')
        .select('*')
        .eq('workflow_id', tempUuid);
        
      if (filesError) {
        console.error('Error fetching files to migrate:', filesError);
        throw new Error(`Files fetch failed: ${filesError.message}`);
      }
      
      if (files && files.length > 0) {
        const fileUpdates = files.map(file => ({
          ...file,
          workflow_id: permanentId,
          id: undefined // Let the database generate new IDs
        }));
        
        const { error: fileUpdateError } = await supabase
          .from('workflow_files')
          .upsert(fileUpdates, {
            onConflict: 'workflow_id,file_id,node_id',
            ignoreDuplicates: false
          });
          
        if (fileUpdateError) {
          console.error('Error migrating workflow files:', fileUpdateError);
          throw new Error(`File migration failed: ${fileUpdateError.message}`);
        }
      }
      
      // 3. Migrate workflow edges
      const { data: edges, error: edgesError } = await supabase
        .from('workflow_edges')
        .select('*')
        .eq('workflow_id', tempUuid);
        
      if (edgesError) {
        console.error('Error fetching edges to migrate:', edgesError);
        throw new Error(`Edges fetch failed: ${edgesError.message}`);
      }
      
      if (edges && edges.length > 0) {
        const edgeUpdates = edges.map(edge => ({
          ...edge,
          workflow_id: permanentId,
          id: undefined // Let the database generate new IDs
        }));
        
        const { error: edgeUpdateError } = await supabase
          .from('workflow_edges')
          .upsert(edgeUpdates, {
            onConflict: 'workflow_id,source_node_id,target_node_id',
            ignoreDuplicates: false
          });
          
        if (edgeUpdateError) {
          console.error('Error migrating workflow edges:', edgeUpdateError);
          throw new Error(`Edge migration failed: ${edgeUpdateError.message}`);
        }
      }
      
      // 4. We don't need to delete the temporary data - it will eventually be cleaned up
      
      setMigrationStatus('success');
      console.log(`Successfully migrated workflow from ${tempId} to ${permanentId}`);
      return true;
    } catch (error) {
      console.error('Error during workflow migration:', error);
      setMigrationStatus('error');
      
      // Attempt recovery - could implement reassociation here
      toast.error('Failed to migrate workflow data. Your work is still saved under a temporary ID.');
      return false;
    } finally {
      setMigrationInProgress(false);
    }
  }, [convertToDbWorkflowId]);
  
  // Propagate file schema from source node to target node
  const propagateFileSchema = useCallback(async (sourceNodeId: string, targetNodeId: string) => {
    if (!workflowId) return;
    
    try {
      console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId}`);
      
      // Convert temporary ID to UUID for database operations if needed
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // Find schema associated with source node
      const { data: sourceSchemas, error: sourceError } = await supabase
        .from('workflow_file_schemas')
        .select('*')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId);
      
      if (sourceError) {
        console.error('Error fetching source schemas:', sourceError);
        return;
      }
      
      // If no schemas found for source node, nothing to propagate
      if (!sourceSchemas || sourceSchemas.length === 0) {
        console.log(`No schemas found for source node ${sourceNodeId}`);
        return;
      }
      
      console.log(`Found ${sourceSchemas.length} schemas for source node ${sourceNodeId}`);
      
      // For each file schema in the source node
      for (const schema of sourceSchemas) {
        // Check if target node already has this schema
        const { data: existingSchema, error: existingError } = await supabase
          .from('workflow_file_schemas')
          .select('id')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', targetNodeId)
          .eq('file_id', schema.file_id)
          .maybeSingle();
          
        if (existingError) {
          console.error('Error checking existing schema:', existingError);
          continue;
        }
        
        // If target node doesn't have this schema, propagate it
        if (!existingSchema) {
          console.log(`Propagating schema for file ${schema.file_id} to node ${targetNodeId}`);
          
          const { error: insertError } = await supabase
            .from('workflow_file_schemas')
            .insert({
              workflow_id: dbWorkflowId,
              file_id: schema.file_id,
              node_id: targetNodeId,
              columns: schema.columns,
              data_types: schema.data_types,
              sample_data: schema.sample_data,
              has_headers: schema.has_headers,
              sheet_name: schema.sheet_name,
              total_rows: schema.total_rows
            });
            
          if (insertError) {
            console.error('Error propagating schema:', insertError);
            toast.error(`Failed to propagate data schema to node ${targetNodeId}`);
          } else {
            // Also add an entry in workflow_files table to maintain file associations
            const { error: fileAssocError } = await supabase
              .from('workflow_files')
              .insert({
                workflow_id: dbWorkflowId,
                file_id: schema.file_id,
                node_id: targetNodeId,
                status: 'queued' // Initially mark as queued, will be processed later
              });
              
            if (fileAssocError) {
              console.error('Error creating file association:', fileAssocError);
            } else {
              console.log(`Created file association for file ${schema.file_id} and node ${targetNodeId}`);
            }
          }
        } else {
          console.log(`Node ${targetNodeId} already has schema for file ${schema.file_id}`);
        }
      }
    } catch (error) {
      console.error('Error in propagateFileSchema:', error);
      toast.error('Failed to propagate file schema between nodes');
    }
  }, [workflowId, convertToDbWorkflowId]);

  // Get file schema for a specific node in the workflow
  const getFileSchema = useCallback(async (nodeId: string): Promise<WorkflowFileSchema | null> => {
    if (!workflowId) return null;
    
    try {
      console.log(`Getting file schema for node ${nodeId}`);
      
      // Convert temporary ID to UUID for database operations if needed
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .select('*')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
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
  }, [workflowId, convertToDbWorkflowId]);

  // Save or update file schema
  const saveFileSchema = useCallback(async (schema: WorkflowFileSchema): Promise<boolean> => {
    try {
      console.log(`Saving file schema for node ${schema.node_id}`);
      
      // Use the provided workflow_id or convert the current one
      const dbWorkflowId = schema.workflow_id || (workflowId ? convertToDbWorkflowId(workflowId) : null);
      
      if (!dbWorkflowId) {
        console.error('No workflow ID available for saving schema');
        return false;
      }
      
      const { error } = await supabase
        .from('workflow_file_schemas')
        .upsert({
          ...schema,
          workflow_id: dbWorkflowId
        }, {
          onConflict: 'workflow_id,file_id,node_id'
        });
        
      if (error) {
        console.error('Error saving file schema:', error);
        toast.error('Failed to save file schema');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error in saveFileSchema:', error);
      toast.error('Error saving file schema');
      return false;
    }
  }, [workflowId, convertToDbWorkflowId]);

  return (
    <WorkflowContext.Provider value={{
      workflowId,
      isTemporaryId,
      propagateFileSchema,
      getFileSchema,
      saveFileSchema,
      migrateTemporaryWorkflow,
      convertToDbWorkflowId,
    }}>
      {children}
    </WorkflowContext.Provider>
  );
};

export const useWorkflow = () => useContext(WorkflowContext);
