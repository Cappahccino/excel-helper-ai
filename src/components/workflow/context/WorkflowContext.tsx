
import React, { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Edge } from '@xyflow/react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { normalizeWorkflowId } from '@/utils/schemaPropagation';

// Define WorkflowFileSchema interface
export interface WorkflowFileSchema {
  columns: string[];
  types: Record<string, string>;
}

interface SchemaContextValue {
  getNodeSchema: (nodeId: string) => SchemaColumn[] | null;
  updateNodeSchema: (nodeId: string, schema: SchemaColumn[]) => void;
  checkSchemaCompatibility?: (sourceSchema: SchemaColumn[], targetConfig: any) => { isCompatible: boolean; errors: string[] };
}

interface WorkflowContextValue {
  workflowId?: string;
  schema: SchemaContextValue;
  getEdges: (workflowId: string) => Promise<Edge[]>;
  isTemporaryId: (id: string) => boolean;
  convertToDbWorkflowId: (id: string) => string;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string) => Promise<boolean>;
  migrateTemporaryWorkflow?: (tempId: string, permanentId: string) => Promise<boolean>;
}

const WorkflowContext = createContext<WorkflowContextValue>({
  schema: {
    getNodeSchema: () => null,
    updateNodeSchema: () => {},
  },
  getEdges: async () => [],
  isTemporaryId: () => false,
  convertToDbWorkflowId: (id) => id,
  propagateFileSchema: async () => false,
});

export const useWorkflow = () => useContext(WorkflowContext);

interface WorkflowProviderProps {
  children: ReactNode;
  workflowId?: string;
  schemaProviderValue: SchemaContextValue;
}

export const WorkflowProvider: React.FC<WorkflowProviderProps> = ({
  children,
  workflowId,
  schemaProviderValue,
}) => {
  // Store node schemas in a ref to avoid losing data on rerenders
  const [nodeSchemas, setNodeSchemas] = useState<{
    [nodeId: string]: SchemaColumn[];
  }>({});

  const isTemporaryId = useCallback((id?: string): boolean => {
    if (!id) return false;
    return id.startsWith('temp-');
  }, []);

  const convertToDbWorkflowId = useCallback((id: string): string => {
    return normalizeWorkflowId(id);
  }, []);

  // Get workflow edges from the database
  const getEdges = useCallback(async (workflowId: string): Promise<Edge[]> => {
    if (!workflowId) return [];
    
    try {
      const dbWorkflowId = normalizeWorkflowId(workflowId);
      console.log(`Getting edges for workflow ${dbWorkflowId}`);
      
      const { data: edgesData, error } = await supabase
        .from('workflow_edges')
        .select('*')
        .eq('workflow_id', dbWorkflowId);

      if (error) {
        console.error('Error fetching edges:', error);
        return [];
      }

      if (!edgesData || edgesData.length === 0) {
        return [];
      }

      // Convert to React Flow edge format
      return edgesData.map((edge) => ({
        id: edge.edge_id || `${edge.source_node_id}-${edge.target_node_id}`,
        source: edge.source_node_id,
        target: edge.target_node_id,
        type: 'default',
        animated: true,
      }));
    } catch (err) {
      console.error('Error in getEdges:', err);
      return [];
    }
  }, []);

  const propagateFileSchema = useCallback(async (sourceNodeId: string, targetNodeId: string): Promise<boolean> => {
    if (!workflowId) return false;
    
    try {
      const dbWorkflowId = normalizeWorkflowId(workflowId);
      console.log(`Propagating schema: ${sourceNodeId} -> ${targetNodeId} in workflow ${dbWorkflowId}`);
      
      // Get the schema from the source node
      const sourceSchema = schemaProviderValue.getNodeSchema(sourceNodeId);
      
      if (!sourceSchema || sourceSchema.length === 0) {
        console.warn('No schema available from source node');
        return false;
      }
      
      // Update the target node with the source schema
      schemaProviderValue.updateNodeSchema(targetNodeId, sourceSchema);
      
      return true;
    } catch (err) {
      console.error('Error propagating schema:', err);
      return false;
    }
  }, [workflowId, schemaProviderValue]);

  // Add migration function for temporary workflows
  const migrateTemporaryWorkflow = useCallback(async (tempId: string, permanentId: string): Promise<boolean> => {
    try {
      console.log(`Migrating temporary workflow: ${tempId} -> ${permanentId}`);
      
      // Remove 'temp-' prefix if it exists
      const normalizedTempId = normalizeWorkflowId(tempId);
      
      // Use direct SQL query instead of RPC function to work around TypeScript limitations
      const { error: schemaError } = await supabase
        .from('workflow_file_schemas')
        .update({
          workflow_id: permanentId,
          is_temporary: false
        })
        .eq('workflow_id', normalizedTempId);
      
      if (schemaError) {
        console.error('Error migrating schema data:', schemaError);
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('Error in migrateTemporaryWorkflow:', err);
      return false;
    }
  }, []);

  return (
    <WorkflowContext.Provider
      value={{
        workflowId,
        schema: schemaProviderValue,
        getEdges,
        isTemporaryId,
        convertToDbWorkflowId,
        propagateFileSchema,
        migrateTemporaryWorkflow,
      }}
    >
      {children}
    </WorkflowContext.Provider>
  );
};
