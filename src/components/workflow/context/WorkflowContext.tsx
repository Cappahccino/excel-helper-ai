
import React, { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import { supabase, convertToDbWorkflowId, isTemporaryWorkflowId } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { Json } from '@/types/workflow';
import { WorkflowFileStatus } from '@/types/workflowStatus';
import { toast } from 'sonner';

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
      
      console.log(`Getting file schema for node ${nodeId} in workflow ${workflowId}`);
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // Check cache first
      const cachedSchema = schemaCache[nodeId];
      if (cachedSchema && Date.now() - cachedSchema.timestamp < 60000) {
        console.log(`Using cached schema for node ${nodeId}`);
        return cachedSchema.schema as WorkflowFileSchema;
      }
      
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
        console.log(`Found schema for node ${nodeId} in workflow_file_schemas:`, schemaData);
        
        // Cast the data appropriately to match our WorkflowFileSchema interface
        const schema: WorkflowFileSchema = {
          columns: schemaData.columns || [],
          types: (schemaData.data_types as Record<string, string>) || {}
        };
        
        // Update cache
        setSchemaCache(prev => ({
          ...prev,
          [nodeId]: {
            schema,
            timestamp: Date.now()
          }
        }));
        
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
        console.log(`No file_id found for node ${nodeId}`);
        return null;
      }
      
      console.log(`Found file_id ${fileData.file_id} for node ${nodeId}, fetching metadata`);
      
      const { data: metaData } = await supabase
        .from('file_metadata')
        .select('column_definitions')
        .eq('file_id', fileData.file_id)
        .maybeSingle();
        
      if (!metaData?.column_definitions) {
        console.log(`No column_definitions found for file ${fileData.file_id}`);
        return null;
      }
      
      console.log(`Found column definitions for file ${fileData.file_id}:`, metaData.column_definitions);
      
      // Cast the data appropriately to match our WorkflowFileSchema interface
      const schema: WorkflowFileSchema = {
        columns: Object.keys(metaData.column_definitions),
        types: metaData.column_definitions as Record<string, string>
      };
      
      // Update cache
      setSchemaCache(prev => ({
        ...prev,
        [nodeId]: {
          schema,
          timestamp: Date.now()
        }
      }));
      
      return schema;
    } catch (err) {
      console.error('Error getting file schema:', err);
      return null;
    }
  }, [workflowId]);

  // Function to propagate schema from source to target
  const propagateFileSchema = useCallback(async (sourceNodeId: string, targetNodeId: string): Promise<boolean> => {
    try {
      console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId}`);
      
      if (!workflowId) {
        console.warn('No workflow ID available');
        return false;
      }
      
      // Check if source is a file node
      const isSource = await isFileNode(sourceNodeId);
      
      if (!isSource) {
        console.log(`Source node ${sourceNodeId} is not a file node`);
        return false;
      }
      
      // Get source schema
      const sourceSchema = await getFileSchema(sourceNodeId);
      
      if (!sourceSchema || !sourceSchema.columns || sourceSchema.columns.length === 0) {
        console.log(`No schema found for source node ${sourceNodeId}`);
        return false;
      }
      
      console.log(`Found schema for source node ${sourceNodeId}:`, sourceSchema);
      
      // Convert to SchemaColumn format
      const schemaColumns: SchemaColumn[] = sourceSchema.columns.map(colName => {
        const colType = sourceSchema.types[colName] || 'unknown';
        let normalizedType: 'string' | 'text' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown' = 'unknown';
        
        if (colType.includes('varchar') || colType.includes('text') || colType.includes('char')) {
          normalizedType = 'string';
        } else if (colType.includes('int') || colType.includes('float') || colType.includes('double') || colType.includes('decimal') || colType.includes('numeric')) {
          normalizedType = 'number';
        } else if (colType.includes('bool')) {
          normalizedType = 'boolean';
        } else if (colType.includes('date') || colType.includes('time')) {
          normalizedType = 'date';
        } else if (colType.includes('json') || colType.includes('object')) {
          normalizedType = 'object';
        } else if (colType.includes('array')) {
          normalizedType = 'array';
        }
        
        return {
          name: colName,
          type: normalizedType
        };
      });
      
      console.log(`Converted schema to SchemaColumn format:`, schemaColumns);
      
      // Save the schema to the workflow_file_schemas table for the target node
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const dataTypes: Record<string, string> = {};
      sourceSchema.columns.forEach(col => {
        dataTypes[col] = sourceSchema.types[col] || 'unknown';
      });
      
      const { error } = await supabase
        .from('workflow_file_schemas')
        .upsert({
          workflow_id: dbWorkflowId,
          node_id: targetNodeId,
          columns: sourceSchema.columns,
          data_types: dataTypes,
          // Use the file_id from the source node
          file_id: await getSourceFileId(dbWorkflowId, sourceNodeId),
          has_headers: true,
          is_temporary: isTemporaryWorkflowId(workflowId)
        }, {
          onConflict: 'workflow_id,node_id'
        });
        
      if (error) {
        console.error('Error saving target schema:', error);
        return false;
      }
      
      console.log(`Successfully propagated schema from ${sourceNodeId} to ${targetNodeId}`);
      
      // Update the schema in the SchemaContext if available
      if (schemaProviderValue?.updateNodeSchema) {
        console.log(`Updating schema context for node ${targetNodeId}`);
        schemaProviderValue.updateNodeSchema(targetNodeId, schemaColumns);
      }
      
      // Also update cache
      setSchemaCache(prev => ({
        ...prev,
        [targetNodeId]: {
          schema: {
            columns: sourceSchema.columns,
            types: dataTypes
          },
          timestamp: Date.now()
        }
      }));
      
      return true;
    } catch (err) {
      console.error('Error propagating file schema:', err);
      return false;
    }
    
    // Helper function to get the file_id from a source node
    async function getSourceFileId(dbWorkflowId: string, sourceNodeId: string): Promise<string> {
      try {
        const { data, error } = await supabase
          .from('workflow_files')
          .select('file_id')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', sourceNodeId)
          .maybeSingle();
          
        if (error || !data?.file_id) {
          console.warn(`No file_id found for source node ${sourceNodeId}, using default`);
          return '00000000-0000-0000-0000-000000000000'; // Placeholder UUID
        }
        
        return data.file_id;
      } catch (err) {
        console.error('Error getting source file ID:', err);
        return '00000000-0000-0000-0000-000000000000'; // Placeholder UUID
      }
    }
  }, [isFileNode, getFileSchema, workflowId, schemaProviderValue]);

  // Function to get edges for a workflow
  const getEdges = useCallback(async (workflowId: string): Promise<any[]> => {
    try {
      if (!workflowId) return [];
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const { data, error } = await supabase
        .from('workflow_edges')
        .select('*')
        .eq('workflow_id', dbWorkflowId);
        
      if (error) {
        console.error('Error fetching workflow edges:', error);
        return [];
      }
      
      const edges = data.map(edge => ({
        id: edge.edge_id || `${edge.source_node_id}-${edge.target_node_id}`,
        source: edge.source_node_id,
        target: edge.target_node_id,
        // Use a type assertion here to ensure it's an object before spreading
        ...(edge.metadata ? edge.metadata as object : {})
      }));
      
      console.log(`Retrieved ${edges.length} edges for workflow ${workflowId}:`, edges);
      
      return edges;
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
