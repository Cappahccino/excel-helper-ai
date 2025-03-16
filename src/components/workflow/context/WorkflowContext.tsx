
import React, { createContext, useContext, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { useWorkflowStateManager } from '@/hooks/useWorkflowStateManager';

interface SchemaContextValue {
  getNodeSchema: (nodeId: string) => SchemaColumn[] | null;
  updateNodeSchema: (nodeId: string, schema: SchemaColumn[]) => void;
  checkSchemaCompatibility: (sourceNodeSchema: SchemaColumn[], targetNodeSchema: SchemaColumn[]) => boolean;
}

interface WorkflowContextValue {
  workflowId?: string;
  executionId?: string;
  getNodeSchema: (nodeId: string) => SchemaColumn[] | null;
  updateNodeSchema: (nodeId: string, schema: SchemaColumn[]) => void;
  checkSchemaCompatibility: (sourceNodeSchema: SchemaColumn[], targetNodeSchema: SchemaColumn[]) => boolean;
  getEdges: (workflowId: string) => Promise<any[]>;
  queueSchemaPropagation: (sourceNodeId: string, targetNodeId: string, sheetName?: string) => void;
  getNodeSheets?: (nodeId: string) => Promise<{name: string, index: number, rowCount: number, isDefault: boolean}[]>;
  setNodeSelectedSheet?: (nodeId: string, sheetName: string) => Promise<void>;
  isNodeReadyForPropagation: (nodeId: string) => Promise<boolean>;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string, sheetName?: string) => Promise<boolean>;
  getNodeStatus: (nodeId: string) => Promise<{status: string, metadata?: any}>;
  updateNodeMetadata: (nodeId: string, metadata: any) => Promise<void>;
}

const WorkflowContext = createContext<WorkflowContextValue>({
  getNodeSchema: () => null,
  updateNodeSchema: () => {},
  checkSchemaCompatibility: () => false,
  getEdges: () => Promise.resolve([]),
  queueSchemaPropagation: () => {},
  isNodeReadyForPropagation: () => Promise.resolve(false),
  propagateFileSchema: () => Promise.resolve(false),
  getNodeStatus: () => Promise.resolve({status: 'idle'}),
  updateNodeMetadata: () => Promise.resolve(),
});

export const useWorkflow = () => useContext(WorkflowContext);

interface WorkflowProviderProps {
  children: React.ReactNode;
  workflowId?: string;
  executionId?: string;
  schemaProviderValue: SchemaContextValue;
}

export const WorkflowProvider: React.FC<WorkflowProviderProps> = ({ 
  children, 
  workflowId,
  executionId,
  schemaProviderValue
}) => {
  const [pendingPropagations, setPendingPropagations] = useState<Array<{
    sourceNodeId: string;
    targetNodeId: string;
    sheetName?: string;
  }>>([]);

  // Use our new workflow state manager for incremental updates
  const { queueStateUpdate } = useWorkflowStateManager(workflowId || null);

  // Queue a schema propagation to be processed later
  const queueSchemaPropagation = useCallback((sourceNodeId: string, targetNodeId: string, sheetName?: string) => {
    console.log(`Queueing schema propagation: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName || 'not specified'}`);
    setPendingPropagations(prev => [
      ...prev,
      { sourceNodeId, targetNodeId, sheetName }
    ]);
  }, []);

  // Get all edges for the workflow
  const getEdges = useCallback(async (workflowId: string) => {
    try {
      // In a real implementation, this would fetch from a database
      // For now, we'll log and return an empty array
      console.log(`Getting edges for workflow ${workflowId}`);
      return Promise.resolve([]);
    } catch (error) {
      console.error("Error getting edges:", error);
      return [];
    }
  }, []);

  // Check if a node is ready for schema propagation
  const isNodeReadyForPropagation = useCallback(async (nodeId: string) => {
    try {
      // In a real implementation, this might query a database
      console.log(`Checking if node ${nodeId} is ready for schema propagation`);
      return Promise.resolve(true);
    } catch (error) {
      console.error("Error checking node readiness:", error);
      return false;
    }
  }, []);

  // Propagate schema from a file node to a target node
  const propagateFileSchema = useCallback(async (sourceNodeId: string, targetNodeId: string, sheetName?: string) => {
    try {
      // In a real implementation, this would perform the actual schema propagation
      console.log(`Propagating schema: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName || 'not specified'}`);
      
      // Example: Query the source schema
      const sourceSchema = schemaProviderValue.getNodeSchema(sourceNodeId);
      if (!sourceSchema) {
        console.error(`No schema available for source node ${sourceNodeId}`);
        return false;
      }
      
      // Update the target schema
      schemaProviderValue.updateNodeSchema(targetNodeId, sourceSchema);
      
      // Queue an incremental update to persist the schema
      if (workflowId) {
        queueStateUpdate('file_schema', {
          nodeId: targetNodeId,
          schema: {
            columns: sourceSchema.map(col => col.name),
            dataTypes: sourceSchema.reduce((acc, col) => ({
              ...acc,
              [col.name]: col.dataType
            }), {})
          }
        });
      }
      
      return true;
    } catch (error) {
      console.error(`Error propagating schema from ${sourceNodeId} to ${targetNodeId}:`, error);
      toast.error("Failed to propagate schema");
      return false;
    }
  }, [schemaProviderValue, workflowId, queueStateUpdate]);

  // Get the status for a specific node
  const getNodeStatus = useCallback(async (nodeId: string) => {
    try {
      // In a real implementation, this would query a database
      console.log(`Getting status for node ${nodeId}`);
      return { status: 'idle' };
    } catch (error) {
      console.error(`Error getting status for node ${nodeId}:`, error);
      return { status: 'error', error: String(error) };
    }
  }, []);

  // Update the metadata for a node
  const updateNodeMetadata = useCallback(async (nodeId: string, metadata: any) => {
    try {
      // In a real implementation, this would update a database
      console.log(`Updating metadata for node ${nodeId}:`, metadata);
      
      // Queue an incremental update to persist the metadata
      if (workflowId) {
        queueStateUpdate('node_metadata', {
          nodeId,
          metadata
        });
      }
    } catch (error) {
      console.error(`Error updating metadata for node ${nodeId}:`, error);
    }
  }, [workflowId, queueStateUpdate]);

  return (
    <WorkflowContext.Provider value={{
     workflowId,
     executionId,
     ...schemaProviderValue,
     getEdges,
     queueSchemaPropagation,
     isNodeReadyForPropagation,
     propagateFileSchema,
     getNodeStatus,
     updateNodeMetadata
    }}>
      {children}
    </WorkflowContext.Provider>  
  );
};
