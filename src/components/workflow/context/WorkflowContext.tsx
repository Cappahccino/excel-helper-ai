import React, { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import { supabase, convertToDbWorkflowId, isTemporaryWorkflowId } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { Json } from '@/types/workflow';
import { WorkflowFileStatus } from '@/types/workflowStatus';
import { propagateSchemaDirectly, synchronizeNodesSheetSelection, isNodeReadyForSchemaPropagation } from '@/utils/schemaPropagation';
import { retryOperation } from '@/utils/retryUtils';
import { 
  getNodeSchema as fetchNodeSchema, 
  getNodeSheets as fetchNodeSheets, 
  setNodeSelectedSheet as updateNodeSelectedSheet,
  validateNodeSheetSchema
} from '@/utils/fileSchemaUtils';
import { useSchemaPropagationQueue, PropagationTask } from '@/hooks/useSchemaPropagationQueue';

export interface WorkflowFileSchema {
  columns: string[];
  types: Record<string, string>;
}

export interface SheetMetadata {
  name: string;
  index: number;
  rowCount: number;
  isDefault: boolean;
}

interface SchemaContextValue {
  getNodeSchema?: (nodeId: string, sheetName?: string) => SchemaColumn[];
  updateNodeSchema?: (nodeId: string, schema: SchemaColumn[], sheetName?: string) => void;
  checkSchemaCompatibility?: (sourceSchema: SchemaColumn[], targetConfig: any) => { 
    isCompatible: boolean;
    errors: string[];
  };
}

// Define the FileMetadata interface to fix the selected_sheet errors
interface FileMetadata {
  selected_sheet?: string;
  sheets?: Array<{
    name: string;
    index: number;
    rowCount?: number;
    isDefault?: boolean;
  }>;
  [key: string]: any;
}

interface WorkflowContextValue {
  workflowId?: string;
  executionId?: string | null;
  isTemporaryId: (id: string) => boolean;
  convertToDbWorkflowId: (id: string) => string;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string, sheetName?: string) => Promise<boolean>;
  queueSchemaPropagation: (sourceNodeId: string, targetNodeId: string, sheetName?: string) => string;
  propagationQueue: PropagationTask[];
  isPropagating: boolean;
  getEdges: (workflowId: string) => Promise<any[]>;
  isNodeReadyForPropagation: (nodeId: string) => Promise<boolean>;
  schema?: SchemaContextValue;
  getFileSchema?: (nodeId: string, sheetName?: string) => Promise<WorkflowFileSchema | null>;
  migrateTemporaryWorkflow?: (temporaryId: string, permanentId: string) => Promise<boolean>;
  getNodeSheets?: (nodeId: string) => Promise<SheetMetadata[] | null>;
  setNodeSelectedSheet?: (nodeId: string, sheetName: string) => Promise<boolean>;
  validateNodeSheetSchema?: (nodeId: string, sheetName?: string) => Promise<{ isValid: boolean, message?: string }>;
  syncSheetSelection?: (sourceNodeId: string, targetNodeId) => Promise<boolean>;
}

const WorkflowContext = createContext<WorkflowContextValue>({
  isTemporaryId: () => false,
  convertToDbWorkflowId: (id) => id,
  propagateFileSchema: async () => false,
  queueSchemaPropagation: () => '',
  propagationQueue: [],
  isPropagating: false,
  getEdges: async () => [],
  isNodeReadyForPropagation: async () => false,
});

interface WorkflowProviderProps {
  children: ReactNode;
  workflowId?: string;
  executionId?: string | null;
  schemaProviderValue?: SchemaContextValue;
}

export const WorkflowProvider: React.FC<WorkflowProviderProps> = ({ 
  children, 
  workflowId,
  executionId,
  schemaProviderValue
}) => {
  const [schemaCache, setSchemaCache] = useState<Record<string, { 
    schema: any, 
    timestamp: number 
  }>>({});

  // Initialize the schema propagation queue
  const { 
    addToQueue, 
    queue: propagationQueue, 
    isProcessing: isPropagating, 
    setPropagateFunction
  } = useSchemaPropagationQueue(workflowId);

  // Define getEdges first to fix the "used before declaration" error
  const getEdges = useCallback(async (workflowId: string): Promise<any[]> => {
    try {
      if (!workflowId) return [];
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      console.log(`Getting edges for workflow ${dbWorkflowId}`);
      
      const result = await retryOperation(
        async () => {
          const { data, error } = await supabase
            .from('workflow_edges')
            .select('*')
            .eq('workflow_id', dbWorkflowId);
            
          if (error) throw error;
          return data || [];
        },
        {
          maxRetries: 2,
          delay: 300
        }
      );
      
      console.log(`Found ${result.length} edges for workflow ${dbWorkflowId}`);
      
      return result.map(edge => ({
        id: edge.edge_id || `${edge.source_node_id}-${edge.target_node_id}`,
        source: edge.source_node_id,
        target: edge.target_node_id,
        ...(edge.metadata ? edge.metadata as object : {})
      }));
    } catch (err) {
      console.error('Error getting workflow edges:', err);
      return [];
    }
  }, []);

  const isFileNode = useCallback((nodeId: string): Promise<boolean> => {
    return new Promise(async (resolve) => {
      try {
        if (!workflowId) return resolve(false);
        
        const dbWorkflowId = convertToDbWorkflowId(workflowId);
        
        console.log(`Checking if node ${nodeId} is a file node in workflow ${dbWorkflowId}`);
        
        const { data, error } = await supabase
          .from('workflow_files')
          .select('file_id')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', nodeId)
          .maybeSingle();
          
        if (error) {
          console.error('Error checking file node:', error);
        }
        
        const isFile = !!data?.file_id;
        console.log(`Node ${nodeId} is${isFile ? '' : ' not'} a file node`);
        resolve(isFile);
      } catch (err) {
        console.error('Error checking if node is file node:', err);
        resolve(false);
      }
    });
  }, [workflowId]);

  const getFileSchema = useCallback(async (
    nodeId: string, 
    sheetName?: string
  ): Promise<WorkflowFileSchema | null> => {
    try {
      if (!workflowId) return null;
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      console.log(`Getting file schema for node ${nodeId} in workflow ${dbWorkflowId}, sheet ${sheetName || 'default'}`);
      
      const schema = await fetchNodeSchema(dbWorkflowId, nodeId, { 
        sheetName: sheetName
      });
      
      return schema;
    } catch (err) {
      console.error('Error getting file schema:', err);
      return null;
    }
  }, [workflowId]);

  const getNodeSheets = useCallback(async (nodeId: string): Promise<SheetMetadata[] | null> => {
    try {
      if (!workflowId) return null;
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      return await fetchNodeSheets(dbWorkflowId, nodeId);
    } catch (err) {
      console.error('Error getting node sheets:', err);
      return null;
    }
  }, [workflowId]);

  const setNodeSelectedSheet = useCallback(async (nodeId: string, sheetName: string): Promise<boolean> => {
    try {
      if (!workflowId) return false;
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      console.log(`Setting selected sheet ${sheetName} for node ${nodeId}`);
      
      // Update the selected sheet in the node's metadata
      const result = await updateNodeSelectedSheet(dbWorkflowId, nodeId, sheetName);
      
      if (result) {
        // Get connected nodes (nodes that this node outputs to)
        const edges = await getEdges(workflowId);
        const targetNodeIds = edges
          .filter(edge => edge.source === nodeId)
          .map(edge => edge.target);
          
        console.log(`Found ${targetNodeIds.length} connected nodes to update with new sheet selection`);
        
        // Propagate the schema to all connected nodes with the new sheet
        for (const targetNodeId of targetNodeIds) {
          console.log(`Propagating schema to ${targetNodeId} with sheet ${sheetName}`);
          await propagateSchemaDirectly(workflowId, nodeId, targetNodeId, sheetName);
        }
      }
      
      return result;
    } catch (err) {
      console.error('Error setting selected sheet:', err);
      return false;
    }
  }, [workflowId, getEdges]);

  const validateSheetSchema = useCallback(async (
    nodeId: string, 
    sheetName?: string
  ): Promise<{ isValid: boolean, message?: string }> => {
    try {
      if (!workflowId) return { isValid: false, message: 'No workflow ID' };
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      return await validateNodeSheetSchema(dbWorkflowId, nodeId, sheetName);
    } catch (err) {
      console.error('Error validating node sheet schema:', err);
      return { isValid: false, message: err.message };
    }
  }, [workflowId]);

  // Implement the isNodeReadyForPropagation method
  const isNodeReadyForPropagation = useCallback(async (nodeId: string): Promise<boolean> => {
    if (!workflowId) return false;
    
    try {
      return await isNodeReadyForSchemaPropagation(workflowId, nodeId);
    } catch (error) {
      console.error(`Error checking if node ${nodeId} is ready for propagation:`, error);
      return false;
    }
  }, [workflowId]);

  // Update propagateFileSchema to be more resilient
  const propagateFileSchema = useCallback(async (
    sourceNodeId: string, 
    targetNodeId: string,
    sheetName?: string
  ): Promise<boolean> => {
    try {
      if (!workflowId) {
        console.error('Cannot propagate schema: no workflow ID provided');
        return false;
      }

      console.log(`Attempting to propagate schema from ${sourceNodeId} to ${targetNodeId}, sheet ${sheetName || 'default'}`);
      
      // Check if source node is ready for propagation
      const isSourceReady = await isNodeReadyForPropagation(sourceNodeId);
      if (!isSourceReady) {
        console.log(`Source node ${sourceNodeId} is not ready for schema propagation`);
        return false;
      }
      
      // First, try direct propagation with the specified sheet name
      const directResult = await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sheetName);
      
      if (directResult) {
        console.log(`Direct schema propagation successful for ${sourceNodeId} -> ${targetNodeId}, sheet ${sheetName || 'default'}`);
        return true;
      }
      
      console.log(`Direct propagation failed, trying alternative approach`);
      
      // If direct propagation fails and no sheet is specified, try to synchronize sheet selection
      if (!sheetName) {
        const syncResult = await synchronizeNodesSheetSelection(workflowId, sourceNodeId, targetNodeId);
        if (syncResult) {
          console.log(`Successfully synchronized sheet selection between nodes`);
          return true;
        }
      }
      
      // Fall back to basic schema propagation if more advanced methods fail
      try {
        // Check if source is a file node
        const isSource = await isFileNode(sourceNodeId);
        
        if (!isSource) {
          console.log(`Source node ${sourceNodeId} is not a file node`);
          // For non-file nodes, we may want to use different propagation methods
        }
        
        // If no sheet name was provided, try to get it from the source node's metadata
        let effectiveSheetName = sheetName;
        if (!effectiveSheetName) {
          const dbWorkflowId = convertToDbWorkflowId(workflowId);
          
          const { data: sourceNodeConfig } = await supabase
            .from('workflow_files')
            .select('metadata')
            .eq('workflow_id', dbWorkflowId)
            .eq('node_id', sourceNodeId)
            .maybeSingle();
            
          // Cast metadata to FileMetadata to avoid type errors
          const metadata = sourceNodeConfig?.metadata as FileMetadata | null;
          effectiveSheetName = metadata?.selected_sheet || 'Sheet1';
          console.log(`Retrieved effective sheet name from source node: ${effectiveSheetName}`);
        }
        
        // Get the source schema
        const sourceSchema = await getFileSchema(sourceNodeId, effectiveSheetName);
        
        if (!sourceSchema) {
          console.log(`No schema found for source node ${sourceNodeId}, sheet ${effectiveSheetName}`);
          return false;
        }
        
        console.log(`Found schema for source node ${sourceNodeId}, sheet ${effectiveSheetName}:`, 
          sourceSchema.columns.slice(0, 5));
        
        // Get a valid file ID (either from the source or a placeholder)
        const dbWorkflowId = convertToDbWorkflowId(workflowId);
        
        const { data: sourceFile } = await supabase
          .from('workflow_files')
          .select('file_id')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', sourceNodeId)
          .maybeSingle();
          
        const { data: targetFile } = await supabase
          .from('workflow_files')
          .select('file_id, metadata')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', targetNodeId)
          .maybeSingle();
        
        // Use target file ID if available, then source file ID, or fallback to placeholder
        let fileId = targetFile?.file_id || sourceFile?.file_id || '00000000-0000-0000-0000-000000000000';
        
        console.log(`Using file ID ${fileId} for schema propagation, sheet ${effectiveSheetName}`);
        
        // Update the schema in the database
        const result = await retryOperation(
          async () => {
            // First, update the target node's metadata to include the selected sheet
            const currentMetadata = targetFile?.metadata as Record<string, any> || {};
            
            // Create or update the workflow_files entry for the target node if needed
            const { error: fileUpdateError } = await supabase
              .from('workflow_files')
              .upsert({ 
                workflow_id: dbWorkflowId,
                node_id: targetNodeId,
                file_id: fileId,
                metadata: {
                  ...currentMetadata,
                  selected_sheet: effectiveSheetName
                }
              }, {
                onConflict: 'workflow_id,node_id'
              });
              
            if (fileUpdateError) {
              console.error('Error updating target node file entry:', fileUpdateError);
              throw fileUpdateError;
            }
            
            // Then update the schema
            const { error: schemaError } = await supabase
              .from('workflow_file_schemas')
              .upsert({
                workflow_id: dbWorkflowId,
                node_id: targetNodeId,
                file_id: fileId,
                sheet_name: effectiveSheetName,
                columns: sourceSchema.columns,
                data_types: sourceSchema.types,
                has_headers: true,
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'workflow_id,node_id,sheet_name'
              });
              
            if (schemaError) {
              console.error('Error updating schema:', schemaError);
              throw schemaError;
            }
            
            console.log(`Successfully propagated schema to target node ${targetNodeId}`);
            return { success: true };
          },
          {
            maxRetries: 3,
            delay: 500,
            onRetry: (err, attempt) => {
              console.log(`Retry ${attempt}/3 updating target schema: ${err.message}`);
            }
          }
        );
        
        return true;
      } catch (propagationError) {
        console.error('Error during fallback schema propagation:', propagationError);
        return false;
      }
    } catch (err) {
      console.error('Error propagating file schema:', err);
      return false;
    }
  }, [isNodeReadyForPropagation, workflowId, isFileNode, getFileSchema]);

  // Register the propagate function with the queue
  useEffect(() => {
    setPropagateFunction(propagateFileSchema);
  }, [propagateFileSchema, setPropagateFunction]);

  // Add the queue schema propagation method
  const queueSchemaPropagation = useCallback((
    sourceNodeId: string, 
    targetNodeId: string, 
    sheetName?: string
  ): string => {
    console.log(`Queueing schema propagation from ${sourceNodeId} to ${targetNodeId}`);
    return addToQueue(sourceNodeId, targetNodeId, sheetName);
  }, [addToQueue]);

  const syncSheetSelection = useCallback(async (
    sourceNodeId: string, 
    targetNodeId: string
  ): Promise<boolean> => {
    try {
      if (!workflowId) return false;
      
      return await synchronizeNodesSheetSelection(workflowId, sourceNodeId, targetNodeId);
    } catch (err) {
      console.error('Error synchronizing sheet selection:', err);
      return false;
    }
  }, [workflowId]);

  const migrateTemporaryWorkflow = useCallback(async (temporaryId: string, permanentId: string): Promise<boolean> => {
    try {
      console.log(`Migrating data from temporary workflow ${temporaryId} to permanent workflow ${permanentId}`);
      
      const tempDbId = temporaryId.startsWith('temp-') ? temporaryId.substring(5) : temporaryId;
      
      const filesMigrationResult = await retryOperation(
        async () => {
          const { error } = await supabase
            .from('workflow_files')
            .update({ workflow_id: permanentId })
            .eq('workflow_id', tempDbId);
          
          if (error) throw error;
          return { success: true };
        },
        { maxRetries: 2 }
      );
      
      const schemasMigrationResult = await retryOperation(
        async () => {
          const { error } = await supabase
            .from('workflow_file_schemas')
            .update({ workflow_id: permanentId })
            .eq('workflow_id', tempDbId);
          
          if (error) throw error;
          return { success: true };
        },
        { maxRetries: 2 }
      );
      
      console.log('Temporary workflow data migration completed successfully');
      return true;
    } catch (err) {
      console.error('Error during workflow migration:', err);
      return false;
    }
  }, []);

  const value: WorkflowContextValue = {
    workflowId,
    executionId,
    isTemporaryId: isTemporaryWorkflowId,
    convertToDbWorkflowId,
    propagateFileSchema,
    queueSchemaPropagation,
    propagationQueue,
    isPropagating,
    getEdges,
    isNodeReadyForPropagation,
    getFileSchema,
    migrateTemporaryWorkflow,
    getNodeSheets,
    setNodeSelectedSheet,
    validateNodeSheetSchema: validateSheetSchema,
    syncSheetSelection,
    schema: schemaProviderValue
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
};

export const useWorkflow = () => useContext(WorkflowContext);
