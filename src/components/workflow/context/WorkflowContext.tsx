import React, { createContext, useContext, ReactNode, useState, useCallback, useEffect } from 'react';
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
import { toast } from 'sonner';

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
          maxRetries: 3,
          delay: 500
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

  // Implement the isNodeReadyForPropagation method with improved logging
  const isNodeReadyForPropagation = useCallback(async (nodeId: string): Promise<boolean> => {
    if (!workflowId) {
      console.log(`Cannot check readiness - no workflow ID for node ${nodeId}`);
      return false;
    }
    
    try {
      console.log(`Checking if node ${nodeId} is ready for propagation in workflow ${workflowId}`);
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
      console.log(`Checking if source node ${sourceNodeId} is ready for propagation`);
      const isSourceReady = await isNodeReadyForPropagation(sourceNodeId);
      if (!isSourceReady) {
        console.log(`Source node ${sourceNodeId} is not ready for schema propagation`);
        return false;
      }
      
      // First, try direct propagation with the specified sheet name
      console.log(`Attempting direct schema propagation from ${sourceNodeId} to ${targetNodeId}`);
      const directResult = await retryOperation(
        async () => propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sheetName),
        {
          maxRetries: 2,
          delay: 500,
          onRetry: (error, attempt) => {
            console.log(`Retry attempt ${attempt} for direct propagation: ${error.message}`);
          }
        }
      );
      
      if (directResult) {
        console.log(`Direct schema propagation successful for ${sourceNodeId} -> ${targetNodeId}, sheet ${sheetName || 'default'}`);
        toast.success("Schema propagated successfully", {
          id: "schema-propagation-success",
          duration: 2000
        });
        return true;
      }
      
      console.log(`Direct propagation failed, trying alternative approach`);
      
      // If direct propagation fails and no sheet is specified, try to synchronize sheet selection
      if (!sheetName) {
        console.log(`Attempting to synchronize sheet selection between ${sourceNodeId} and ${targetNodeId}`);
        const syncResult = await synchronizeNodesSheetSelection(workflowId, sourceNodeId, targetNodeId);
        if (syncResult) {
          console.log(`Successfully synchronized sheet selection between nodes`);
          return true;
        }
      }
      
      // Fall back to basic schema propagation if more advanced methods fail
      console.log(`Attempting fallback schema propagation method`);
      
      try {
        const dbWorkflowId = convertToDbWorkflowId(workflowId);
        
        // If no sheet name was provided, try to get it from the source node's metadata
        console.log(`Determining effective sheet name for propagation`);
        let effectiveSheetName = sheetName;
        if (!effectiveSheetName) {
          const { data: sourceNodeConfig } = await supabase
            .from('workflow_files')
            .select('metadata')
            .eq('workflow_id', dbWorkflowId)
            .eq('node_id', sourceNodeId)
            .maybeSingle();
            
          // Cast metadata to FileMetadata to avoid type errors
          const metadata = sourceNodeConfig?.metadata as any;
          effectiveSheetName = metadata?.selected_sheet || 'Sheet1';
          console.log(`Retrieved effective sheet name from source node: ${effectiveSheetName}`);
        }
        
        // Get the source file details
        console.log(`Fetching source file details`);
        const { data: sourceFile } = await supabase
          .from('workflow_files')
          .select('file_id, processing_status')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', sourceNodeId)
          .maybeSingle();
          
        if (sourceFile?.processing_status !== 'completed') {
          console.log(`Source file is not fully processed yet (status: ${sourceFile?.processing_status})`);
          return false;
        }
        
        // Get the target file details
        const { data: targetFile } = await supabase
          .from('workflow_files')
          .select('file_id, metadata')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', targetNodeId)
          .maybeSingle();
        
        // Use source file ID if available, or fallback to placeholder
        const fileId = sourceFile?.file_id || '00000000-0000-0000-0000-000000000000';
        
        console.log(`Using file ID ${fileId} for schema propagation, sheet ${effectiveSheetName}`);
        
        // Get the source schema
        console.log(`Fetching schema for source node ${sourceNodeId}`);
        const { data: schemaData } = await supabase
          .from('workflow_file_schemas')
          .select('columns, data_types, file_id, has_headers')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', sourceNodeId)
          .eq('sheet_name', effectiveSheetName)
          .maybeSingle();
          
        if (!schemaData) {
          console.log(`No schema found for source node ${sourceNodeId}, sheet ${effectiveSheetName}`);
          return false;
        }
        
        console.log(`Found schema for source node with ${schemaData.columns.length} columns`);
        
        // Update the target schema with the source schema
        console.log(`Updating target node ${targetNodeId} schema`);
        
        // First update the file association if needed
        if (!targetFile) {
          console.log(`Creating new file association for target node ${targetNodeId}`);
          const { error: fileCreateError } = await supabase
            .from('workflow_files')
            .insert({
              workflow_id: dbWorkflowId,
              node_id: targetNodeId,
              file_id: fileId,
              processing_status: 'completed',
              metadata: {
                selected_sheet: effectiveSheetName
              }
            });
            
          if (fileCreateError) {
            console.error(`Error creating file association:`, fileCreateError);
            return false;
          }
        } else {
          // Update the existing association
          console.log(`Updating existing file association for target node ${targetNodeId}`);
          const { error: fileUpdateError } = await supabase
            .from('workflow_files')
            .update({
              file_id: fileId,
              processing_status: 'completed',
              metadata: {
                ...targetFile.metadata,
                selected_sheet: effectiveSheetName
              }
            })
            .eq('workflow_id', dbWorkflowId)
            .eq('node_id', targetNodeId);
            
          if (fileUpdateError) {
            console.error(`Error updating file association:`, fileUpdateError);
            return false;
          }
        }
        
        // Now update the schema
        console.log(`Updating schema for target node ${targetNodeId}, sheet ${effectiveSheetName}`);
        const { error: schemaUpdateError } = await supabase
          .from('workflow_file_schemas')
          .upsert({
            workflow_id: dbWorkflowId,
            node_id: targetNodeId,
            file_id: fileId,
            sheet_name: effectiveSheetName,
            columns: schemaData.columns,
            data_types: schemaData.data_types,
            has_headers: schemaData.has_headers,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'workflow_id,node_id,sheet_name'
          });
          
        if (schemaUpdateError) {
          console.error(`Error updating schema:`, schemaUpdateError);
          return false;
        }
        
        console.log(`Successfully propagated schema to target node ${targetNodeId}`);
        return true;
      } catch (fallbackError) {
        console.error('Error during fallback schema propagation:', fallbackError);
        return false;
      }
    } catch (err) {
      console.error('Error propagating file schema:', err);
      return false;
    }
  }, [isNodeReadyForPropagation, workflowId]);

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
    console.log(`Queueing schema propagation from ${sourceNodeId} to ${targetNodeId} with sheet ${sheetName || 'default'}`);
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
