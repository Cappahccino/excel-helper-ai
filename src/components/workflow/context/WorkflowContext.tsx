import React, { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import { supabase, convertToDbWorkflowId, isTemporaryWorkflowId } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { Json } from '@/types/workflow';
import { WorkflowFileStatus } from '@/types/workflowStatus';
import { propagateSchemaDirectly, normalizeWorkflowId } from '@/utils/schemaPropagation';

// Define the schema for file data with correct types
export interface WorkflowFileSchema {
  columns: string[];
  types: Record<string, string>;
}

interface SchemaContextValue {
  getNodeSchema?: (nodeId: string) => SchemaColumn[];
  updateNodeSchema?: (nodeId: string, schema: SchemaColumn[]) => void;
  checkSchemaCompatibility?: (sourceSchema: SchemaColumn[], targetConfig: any) => { 
    isCompatible: boolean;
    errors: string[];
  };
}

interface WorkflowContextValue {
  workflowId?: string;
  isTemporaryId: (id: string) => boolean;
  convertToDbWorkflowId: (id: string) => string;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string) => Promise<boolean>;
  getEdges: (workflowId: string) => Promise<any[]>;
  schema?: SchemaContextValue;
  getFileSchema?: (nodeId: string) => Promise<WorkflowFileSchema | null>;
  migrateTemporaryWorkflow?: (temporaryId: string, permanentId: string) => Promise<boolean>;
}

const WorkflowContext = createContext<WorkflowContextValue>({
  isTemporaryId: () => false,
  convertToDbWorkflowId: (id) => id,
  propagateFileSchema: async () => false,
  getEdges: async () => [],
});

interface WorkflowProviderProps {
  children: ReactNode;
  workflowId?: string;
  schemaProviderValue?: SchemaContextValue;
}

export const WorkflowProvider: React.FC<WorkflowProviderProps> = ({ 
  children, 
  workflowId,
  schemaProviderValue
}) => {
  // Cache for retrieved file schemas
  const [schemaCache, setSchemaCache] = useState<Record<string, { 
    schema: any, 
    timestamp: number 
  }>>({});

  // Function to check if a node is related to file operations
  const isFileNode = useCallback((nodeId: string): Promise<boolean> => {
    return new Promise(async (resolve) => {
      try {
        if (!workflowId) return resolve(false);
        
        const dbWorkflowId = convertToDbWorkflowId(workflowId);
        
        const { data, error } = await supabase
          .from('workflow_files')
          .select('file_id')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', nodeId)
          .maybeSingle();
          
        resolve(!!data?.file_id);
      } catch (err) {
        console.error('Error checking if node is file node:', err);
        resolve(false);
      }
    });
  }, [workflowId]);

  // Function to get file schema from a node
  const getFileSchema = useCallback(async (nodeId: string): Promise<WorkflowFileSchema | null> => {
    try {
      if (!workflowId) return null;
      
      const dbWorkflowId = normalizeWorkflowId(workflowId);
      
      // Try to get schema from workflow_file_schemas table first
      const { data: schemaData, error: schemaError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      if (schemaError) {
        console.error('Error fetching schema:', schemaError);
        return null;
      }
      
      if (schemaData) {
        // Cast the data appropriately to match our WorkflowFileSchema interface
        const schema: WorkflowFileSchema = {
          columns: schemaData.columns || [],
          types: (schemaData.data_types as Record<string, string>) || {}
        };
        return schema;
      }
      
      // If no schema found, try to get it from the file metadata
      const { data: fileData } = await supabase
        .from('workflow_files')
        .select('file_id')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      if (!fileData?.file_id) {
        return null;
      }
      
      const { data: metaData } = await supabase
        .from('file_metadata')
        .select('column_definitions')
        .eq('file_id', fileData.file_id)
        .maybeSingle();
        
      if (!metaData?.column_definitions) {
        return null;
      }
      
      // Cast the data appropriately to match our WorkflowFileSchema interface
      const schema: WorkflowFileSchema = {
        columns: Object.keys(metaData.column_definitions),
        types: metaData.column_definitions as Record<string, string>
      };
      
      return schema;
    } catch (err) {
      console.error('Error getting file schema:', err);
      return null;
    }
  }, [workflowId]);

  // Function to propagate schema from source to target
  const propagateFileSchema = useCallback(async (sourceNodeId: string, targetNodeId: string): Promise<boolean> => {
    try {
      if (!workflowId) return false;

      console.log(`Attempting to propagate schema from ${sourceNodeId} to ${targetNodeId}`);
      
      // Use the direct propagation method which works better with temporary workflows
      const directResult = await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId);
      
      if (directResult) {
        console.log(`Direct schema propagation successful for ${sourceNodeId} -> ${targetNodeId}`);
        return true;
      }
      
      // Check if source is a file node
      const isSource = await isFileNode(sourceNodeId);
      
      if (!isSource) {
        console.log(`Source node ${sourceNodeId} is not a file node`);
        return false;
      }
      
      // Get source schema
      const sourceSchema = await getFileSchema(sourceNodeId);
      
      if (!sourceSchema) {
        console.log(`No schema found for source node ${sourceNodeId}`);
        return false;
      }
      
      console.log(`Found schema for source node ${sourceNodeId}:`, sourceSchema);
      
      // Update the target node schema in the database
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // Get the file_id from source if available
      const { data: fileData } = await supabase
        .from('workflow_files')
        .select('file_id')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .maybeSingle();
        
      const fileId = fileData?.file_id || '00000000-0000-0000-0000-000000000000';
      
      // Create or update schema for target node
      const { error } = await supabase
        .from('workflow_file_schemas')
        .upsert({
          workflow_id: dbWorkflowId,
          node_id: targetNodeId,
          file_id: fileId,
          columns: sourceSchema.columns,
          data_types: sourceSchema.types,
          has_headers: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'workflow_id,node_id'
        });
        
      if (error) {
        console.error('Error updating target schema:', error);
        return false;
      }
      
      console.log(`Successfully propagated schema to target node ${targetNodeId}`);
      return true;
    } catch (err) {
      console.error('Error propagating file schema:', err);
      return false;
    }
  }, [isFileNode, getFileSchema, workflowId]);

  // Function to get edges for a workflow
  const getEdges = useCallback(async (workflowId: string): Promise<any[]> => {
    try {
      if (!workflowId) return [];
      
      const dbWorkflowId = normalizeWorkflowId(workflowId);
      
      const { data, error } = await supabase
        .from('workflow_edges')
        .select('*')
        .eq('workflow_id', dbWorkflowId);
        
      if (error) {
        console.error('Error fetching workflow edges:', error);
        return [];
      }
      
      return data.map(edge => ({
        id: edge.edge_id || `${edge.source_node_id}-${edge.target_node_id}`,
        source: edge.source_node_id,
        target: edge.target_node_id,
        // Use a type assertion here to ensure it's an object before spreading
        ...(edge.metadata ? edge.metadata as object : {})
      }));
    } catch (err) {
      console.error('Error getting workflow edges:', err);
      return [];
    }
  }, []);

  // Function to migrate data from temporary workflow to permanent workflow
  const migrateTemporaryWorkflow = useCallback(async (temporaryId: string, permanentId: string): Promise<boolean> => {
    try {
      console.log(`Migrating data from temporary workflow ${temporaryId} to permanent workflow ${permanentId}`);
      
      // Instead of using RPC, use direct table operations
      // Migrate workflow_files
      const { error: filesMigrationError } = await supabase
        .from('workflow_files')
        .update({ workflow_id: permanentId })
        .eq('workflow_id', temporaryId);
      
      if (filesMigrationError) {
        console.error('Error migrating workflow files:', filesMigrationError);
        return false;
      }
      
      // Migrate workflow_file_schemas
      const { error: schemasMigrationError } = await supabase
        .from('workflow_file_schemas')
        .update({ workflow_id: permanentId })
        .eq('workflow_id', temporaryId);
      
      if (schemasMigrationError) {
        console.error('Error migrating workflow schemas:', schemasMigrationError);
        return false;
      }
      
      console.log('Temporary workflow data migration completed successfully');
      return true;
    } catch (err) {
      console.error('Error during workflow migration:', err);
      return false;
    }
  }, []);

  const value: WorkflowContextValue = {
    workflowId,
    isTemporaryId: isTemporaryWorkflowId,
    convertToDbWorkflowId,
    propagateFileSchema,
    getEdges,
    getFileSchema,
    migrateTemporaryWorkflow,
    schema: schemaProviderValue
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
};

export const useWorkflow = () => useContext(WorkflowContext);
