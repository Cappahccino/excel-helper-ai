
import React, { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import { supabase, convertToDbWorkflowId, isTemporaryWorkflowId } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { Json } from '@/types/workflow';
import { WorkflowFileStatus } from '@/types/workflowStatus';
import { propagateSchemaDirectly } from '@/utils/schemaPropagation';
import { retryOperation } from '@/utils/retryUtils';
import { getNodeSchema, getNodeSheets, setNodeSelectedSheet } from '@/utils/fileSchemaUtils';

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

interface WorkflowContextValue {
  workflowId?: string;
  isTemporaryId: (id: string) => boolean;
  convertToDbWorkflowId: (id: string) => string;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string, sheetName?: string) => Promise<boolean>;
  getEdges: (workflowId: string) => Promise<any[]>;
  schema?: SchemaContextValue;
  getFileSchema?: (nodeId: string, sheetName?: string) => Promise<WorkflowFileSchema | null>;
  migrateTemporaryWorkflow?: (temporaryId: string, permanentId: string) => Promise<boolean>;
  getNodeSheets?: (nodeId: string) => Promise<SheetMetadata[] | null>;
  setNodeSelectedSheet?: (nodeId: string, sheetName: string) => Promise<boolean>;
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
  const [schemaCache, setSchemaCache] = useState<Record<string, { 
    schema: any, 
    timestamp: number 
  }>>({});

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
      
      // getNodeSchema expects workflowId, nodeId, and options
      const schema = await getNodeSchema(dbWorkflowId, nodeId, { 
        sheetName: sheetName || 'Sheet1' 
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
      
      // getNodeSheets expects workflowId and nodeId
      return await getNodeSheets(dbWorkflowId, nodeId);
    } catch (err) {
      console.error('Error getting node sheets:', err);
      return null;
    }
  }, [workflowId]);

  const setNodeSelectedSheet = useCallback(async (nodeId: string, sheetName: string): Promise<boolean> => {
    try {
      if (!workflowId) return false;
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // setNodeSelectedSheet expects workflowId, nodeId, and sheetName
      return await setNodeSelectedSheet(dbWorkflowId, nodeId, sheetName);
    } catch (err) {
      console.error('Error setting selected sheet:', err);
      return false;
    }
  }, [workflowId]);

  const propagateFileSchema = useCallback(async (
    sourceNodeId: string, 
    targetNodeId: string,
    sheetName?: string
  ): Promise<boolean> => {
    try {
      if (!workflowId) return false;

      console.log(`Attempting to propagate schema from ${sourceNodeId} to ${targetNodeId}, sheet ${sheetName || 'default'}`);
      
      if (!sheetName) {
        const sourceSheets = await getNodeSheets(sourceNodeId);
        const defaultSheet = sourceSheets?.find(sheet => sheet.isDefault);
        sheetName = defaultSheet?.name || 'Sheet1';
      }
      
      const directResult = await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sheetName);
      
      if (directResult) {
        console.log(`Direct schema propagation successful for ${sourceNodeId} -> ${targetNodeId}, sheet ${sheetName}`);
        return true;
      }
      
      console.log(`Direct propagation failed, trying alternative approach`);
      
      const isSource = await isFileNode(sourceNodeId);
      
      if (!isSource) {
        console.log(`Source node ${sourceNodeId} is not a file node`);
        return false;
      }
      
      const sourceSchema = await getFileSchema(sourceNodeId, sheetName);
      
      if (!sourceSchema) {
        console.log(`No schema found for source node ${sourceNodeId}, sheet ${sheetName}`);
        return false;
      }
      
      console.log(`Found schema for source node ${sourceNodeId}, sheet ${sheetName}:`, sourceSchema);
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const { data: fileData } = await supabase
        .from('workflow_files')
        .select('file_id')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .maybeSingle();
        
      const fileId = fileData?.file_id || '00000000-0000-0000-0000-000000000000';
      
      console.log(`Using file ID ${fileId} for schema propagation, sheet ${sheetName}`);
      
      const result = await retryOperation(
        async () => {
          const { error } = await supabase
            .from('workflow_file_schemas')
            .upsert({
              workflow_id: dbWorkflowId,
              node_id: targetNodeId,
              file_id: fileId,
              sheet_name: sheetName,
              columns: sourceSchema.columns,
              data_types: sourceSchema.types,
              has_headers: true,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'workflow_id,node_id,sheet_name'
            });
            
          if (error) throw error;
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
      
      console.log(`Successfully propagated schema to target node ${targetNodeId}, sheet ${sheetName}`);
      return true;
    } catch (err) {
      console.error('Error propagating file schema:', err);
      return false;
    }
  }, [isFileNode, getFileSchema, workflowId, getNodeSheets]);

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
    isTemporaryId: isTemporaryWorkflowId,
    convertToDbWorkflowId,
    propagateFileSchema,
    getEdges,
    getFileSchema,
    migrateTemporaryWorkflow,
    getNodeSheets,
    setNodeSelectedSheet,
    schema: schemaProviderValue
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
};

export const useWorkflow = () => useContext(WorkflowContext);
