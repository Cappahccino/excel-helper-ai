
// We'll focus on the most performance-critical methods in the WorkflowContext
// This is a partial update that optimizes key functions

import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { supabase, convertToDbWorkflowId, isTemporaryWorkflowId } from '@/integrations/supabase/client';
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
  is_temporary?: boolean;
}

interface WorkflowContextType {
  workflowId?: string;
  isTemporaryId: boolean;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string) => Promise<boolean>;
  getFileSchema: (nodeId: string) => Promise<WorkflowFileSchema | null>;
  saveFileSchema: (schema: WorkflowFileSchema) => Promise<boolean>;
  migrateTemporaryWorkflow: (tempId: string, permanentId: string) => Promise<boolean>;
  convertToDbWorkflowId: (id: string) => string;
}

const WorkflowContext = createContext<WorkflowContextType>({
  isTemporaryId: false,
  propagateFileSchema: async () => false,
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
  const debouncedMigrationStatus = useDebounce(migrationStatus, 300);
  
  // Cache for file schemas to reduce database reads
  const schemaCache = useRef<Map<string, Map<string, WorkflowFileSchema>>>(new Map());
  const isTemporaryId = useMemo(() => workflowId ? isTemporaryWorkflowId(workflowId) : false, [workflowId]);
  
  // Optimized migration function with batched operations
  const migrateTemporaryWorkflow = useCallback(async (tempId: string, permanentId: string): Promise<boolean> => {
    if (!tempId || !permanentId || !isTemporaryWorkflowId(tempId)) {
      console.error('Invalid migration: Source must be temporary ID and target must be permanent');
      return false;
    }
    
    try {
      setMigrationInProgress(true);
      setMigrationStatus('pending');
      console.log(`Migrating workflow data from ${tempId} to ${permanentId}`);
      
      // Extract the UUID part of the temporary ID
      const tempUuid = convertToDbWorkflowId(tempId);
      
      // We'll skip using transactions since the RPC isn't available
      // and handle each operation independently
      try {
        // 1. Migrate file schemas with a single query
        const { data: schemas, error: schemasError } = await supabase
          .from('workflow_file_schemas')
          .select('*')
          .eq('workflow_id', tempUuid)
          .eq('is_temporary', true);
          
        if (schemasError) {
          console.error('Error fetching schemas to migrate:', schemasError);
          throw new Error(`Schema fetch failed: ${schemasError.message}`);
        }
        
        if (schemas && schemas.length > 0) {
          // Process in efficient batches
          const batchSize = 50; // Adjust based on your DB performance
          for (let i = 0; i < schemas.length; i += batchSize) {
            const batchSchemas = schemas.slice(i, i + batchSize);
            
            // Update workflow_id in all schemas
            const updates = batchSchemas.map(schema => ({
              ...schema,
              workflow_id: permanentId,
              is_temporary: false,
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
        }
        
        // 2. Migrate workflow files with efficient batching
        const { data: files, error: filesError } = await supabase
          .from('workflow_files')
          .select('*')
          .eq('workflow_id', tempUuid)
          .eq('is_temporary', true);
          
        if (filesError) {
          console.error('Error fetching files to migrate:', filesError);
          throw new Error(`Files fetch failed: ${filesError.message}`);
        }
        
        if (files && files.length > 0) {
          const batchSize = 50;
          for (let i = 0; i < files.length; i += batchSize) {
            const batchFiles = files.slice(i, i + batchSize);
            
            const fileUpdates = batchFiles.map(file => ({
              ...file,
              workflow_id: permanentId,
              is_temporary: false,
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
        }
        
        // 3. Migrate workflow edges with efficient batching
        const { data: edges, error: edgesError } = await supabase
          .from('workflow_edges')
          .select('*')
          .eq('workflow_id', tempUuid);
          
        if (edgesError) {
          console.error('Error fetching edges to migrate:', edgesError);
          throw new Error(`Edges fetch failed: ${edgesError.message}`);
        }
        
        if (edges && edges.length > 0) {
          const batchSize = 50;
          for (let i = 0; i < edges.length; i += batchSize) {
            const batchEdges = edges.slice(i, i + batchSize);
            
            const edgeUpdates = batchEdges.map(edge => ({
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
        }
        
        // 4. Update the workflow itself
        const { error: workflowUpdateError } = await supabase
          .from('workflows')
          .update({ is_temporary: false })
          .eq('id', permanentId);
          
        if (workflowUpdateError) {
          console.error('Error updating workflow temporary status:', workflowUpdateError);
        }
        
        setMigrationStatus('success');
        console.log(`Successfully migrated workflow from ${tempId} to ${permanentId}`);
        
        // Clear any cached data for the old workflow ID
        clearCachedWorkflowData(tempId);
        
        return true;
      } catch (innerError) {
        throw innerError;
      }
    } catch (error) {
      console.error('Error during workflow migration:', error);
      setMigrationStatus('error');
      
      // Attempt recovery - could implement reassociation here
      toast.error('Failed to migrate workflow data. Your work is still saved under a temporary ID.');
      return false;
    } finally {
      setMigrationInProgress(false);
    }
  }, []);
  
  // Helper to clear cached data when needed
  const clearCachedWorkflowData = useCallback((workflowId: string) => {
    schemaCache.current.delete(workflowId);
  }, []);
  
  // Optimized propagateFileSchema with caching
  const propagateFileSchema = useCallback(async (sourceNodeId: string, targetNodeId: string): Promise<boolean> => {
    if (!workflowId) return false;
    
    try {
      console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId}`);
      
      // Convert temporary ID to UUID for database operations if needed
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      const isTemporary = isTemporaryWorkflowId(workflowId);
      
      // Check cache first for the source node's schemas
      let sourceSchemas;
      const workflowCache = schemaCache.current.get(dbWorkflowId);
      
      if (workflowCache && workflowCache.has(sourceNodeId)) {
        // Use cached schema
        sourceSchemas = [workflowCache.get(sourceNodeId)!];
      } else {
        // Find schema associated with source node
        const { data, error: sourceError } = await supabase
          .from('workflow_file_schemas')
          .select('*')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', sourceNodeId);
        
        if (sourceError) {
          console.error('Error fetching source schemas:', sourceError);
          return false;
        }
        
        sourceSchemas = data;
        
        // Cache the result if we found something
        if (data && data.length > 0) {
          if (!schemaCache.current.has(dbWorkflowId)) {
            schemaCache.current.set(dbWorkflowId, new Map());
          }
          schemaCache.current.get(dbWorkflowId)!.set(sourceNodeId, data[0]);
        }
      }
      
      // If no schemas found for source node, nothing to propagate
      if (!sourceSchemas || sourceSchemas.length === 0) {
        console.log(`No schemas found for source node ${sourceNodeId}`);
        return false;
      }
      
      console.log(`Found ${sourceSchemas.length} schemas for source node ${sourceNodeId}`);
      
      let propagatedAny = false;
      
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
          
          const newSchema = {
            workflow_id: dbWorkflowId,
            file_id: schema.file_id,
            node_id: targetNodeId,
            columns: schema.columns,
            data_types: schema.data_types,
            sample_data: schema.sample_data,
            has_headers: schema.has_headers,
            sheet_name: schema.sheet_name,
            total_rows: schema.total_rows,
            is_temporary: isTemporary
          };
          
          const { error: insertError } = await supabase
            .from('workflow_file_schemas')
            .insert(newSchema);
            
          if (insertError) {
            console.error('Error propagating schema:', insertError);
            toast.error(`Failed to propagate data schema to node ${targetNodeId}`);
          } else {
            propagatedAny = true;
            
            // Cache the new schema
            if (!schemaCache.current.has(dbWorkflowId)) {
              schemaCache.current.set(dbWorkflowId, new Map());
            }
            schemaCache.current.get(dbWorkflowId)!.set(targetNodeId, newSchema as WorkflowFileSchema);
            
            // Also add an entry in workflow_files table to maintain file associations
            const { error: fileAssocError } = await supabase
              .from('workflow_files')
              .insert({
                workflow_id: dbWorkflowId,
                file_id: schema.file_id,
                node_id: targetNodeId,
                status: 'queued', // Initially mark as queued, will be processed later
                is_temporary: isTemporary
              });
              
            if (fileAssocError) {
              console.error('Error creating file association:', fileAssocError);
            } else {
              console.log(`Created file association for file ${schema.file_id} and node ${targetNodeId}`);
            }
          }
        } else {
          console.log(`Node ${targetNodeId} already has schema for file ${schema.file_id}`);
          propagatedAny = true; // Consider it successful if schema already exists
        }
      }
      
      return propagatedAny;
    } catch (error) {
      console.error('Error in propagateFileSchema:', error);
      toast.error('Failed to propagate file schema between nodes');
      return false;
    }
  }, [workflowId]);

  // Get file schema for a specific node in the workflow
  const getFileSchema = useCallback(async (nodeId: string): Promise<WorkflowFileSchema | null> => {
    if (!workflowId) return null;
    
    try {
      console.log(`Getting file schema for node ${nodeId}`);
      
      // Convert temporary ID to UUID for database operations if needed
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // Check cache first
      const workflowCache = schemaCache.current.get(dbWorkflowId);
      if (workflowCache && workflowCache.has(nodeId)) {
        return workflowCache.get(nodeId)!;
      }
      
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
      
      // Cache the result if we got data
      if (data) {
        if (!schemaCache.current.has(dbWorkflowId)) {
          schemaCache.current.set(dbWorkflowId, new Map());
        }
        schemaCache.current.get(dbWorkflowId)!.set(nodeId, data);
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
      console.log(`Saving file schema for node ${schema.node_id}`);
      
      // Use the provided workflow_id or convert the current one
      const dbWorkflowId = schema.workflow_id || (workflowId ? convertToDbWorkflowId(workflowId) : null);
      const isTemporary = workflowId ? isTemporaryWorkflowId(workflowId) : false;
      
      if (!dbWorkflowId) {
        console.error('No workflow ID available for saving schema');
        return false;
      }
      
      const { error } = await supabase
        .from('workflow_file_schemas')
        .upsert({
          ...schema,
          workflow_id: dbWorkflowId,
          is_temporary: isTemporary
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
  }, [workflowId]);

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
