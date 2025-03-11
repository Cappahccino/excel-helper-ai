import React, { createContext, useContext, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase, convertToDbWorkflowId, isTemporaryWorkflowId, formatWorkflowId } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { WorkflowContextType } from '@/types/workflow';

interface WorkflowProviderProps {
  children: React.ReactNode;
  workflowId?: string;
}

export const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

export const useWorkflow = () => {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
};

export const WorkflowProvider: React.FC<WorkflowProviderProps> = ({ 
  children, 
  workflowId 
}) => {
  const [isTemporaryId, setIsTemporaryId] = useState<boolean>(workflowId ? isTemporaryWorkflowId(workflowId) : false);
  
  const generateTemporaryId = useCallback((): string => {
    const tempId = uuidv4();
    sessionStorage.setItem(`temp_${tempId}`, 'true');
    setIsTemporaryId(true);
    return tempId;
  }, []);
  
  const convertToDbWorkflowIdFn = useCallback((id: string): string => {
    return convertToDbWorkflowId(id);
  }, []);
  
  const formatWorkflowIdFn = useCallback((id: string, temporary: boolean = false): string => {
    return formatWorkflowId(id, temporary);
  }, []);

  const migrateTemporaryWorkflow = async (oldWorkflowId: string, newWorkflowId: string): Promise<boolean> => {
    try {
      if (!oldWorkflowId || !newWorkflowId) {
        console.error('Invalid workflow IDs provided for migration');
        return false;
      }
      
      const dbNewWorkflowId = convertToDbWorkflowId(newWorkflowId);
      
      // Migrate workflow_files
      const { error: filesError } = await supabase
        .from('workflow_files')
        .update({ workflow_id: dbNewWorkflowId })
        .eq('workflow_id', oldWorkflowId);
      
      if (filesError) {
        console.error('Error migrating workflow_files:', filesError);
      }
      
      // Migrate workflow_edges
      const { error: edgesError } = await supabase
        .from('workflow_edges')
        .update({ workflow_id: dbNewWorkflowId })
        .eq('workflow_id', oldWorkflowId);
      
      if (edgesError) {
        console.error('Error migrating workflow_edges:', edgesError);
      }
      
      // Migrate workflow_step_logs
      const { error: logsError } = await supabase
        .from('workflow_step_logs')
        .update({ workflow_id: dbNewWorkflowId })
        .eq('workflow_id', oldWorkflowId);
      
      if (logsError) {
        console.error('Error migrating workflow_step_logs:', logsError);
      }
      
      // Remove temporary ID from session storage
      sessionStorage.removeItem(`temp_${oldWorkflowId}`);
      setIsTemporaryId(false);
      
      toast.success('Workflow data migrated successfully');
      return true;
    } catch (error) {
      console.error('Error during workflow data migration:', error);
      toast.error('Failed to migrate workflow data');
      return false;
    }
  };
  
  /**
   * Propagate file schema from source node to target node
   */
  const propagateFileSchema = async (sourceNodeId: string, targetNodeId: string): Promise<boolean> => {
    try {
      if (!workflowId) {
        console.error('No workflow ID available for schema propagation');
        return false;
      }
      
      // Get schema from source node
      const { data: fileSchema, error: schemaError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types')
        .eq('workflow_id', convertToDbWorkflowId(workflowId))
        .eq('node_id', sourceNodeId)
        .maybeSingle();
      
      if (schemaError) {
        console.error('Error fetching source schema:', schemaError);
        return false;
      }
      
      if (!fileSchema) {
        // No direct schema yet, might be another type of node
        // Use schemaUtils to try alternate methods of getting schema
        const { schemaUtils } = await import('@/utils/schemaUtils');
        return await schemaUtils.propagateSchema(workflowId, sourceNodeId, targetNodeId);
      }
      
      // Get existing edge
      const { data: edge, error: edgeError } = await supabase
        .from('workflow_edges')
        .select('id, metadata')
        .eq('workflow_id', convertToDbWorkflowId(workflowId))
        .eq('source_node_id', sourceNodeId)
        .eq('target_node_id', targetNodeId)
        .maybeSingle();
      
      if (edgeError) {
        console.error('Error fetching edge:', edgeError);
        return false;
      }
      
      if (!edge) {
        console.log('No edge found between source and target nodes');
        return false;
      }
      
      // Convert database schema to SchemaColumn[] format
      const schemaColumns = fileSchema.columns.map((colName: string) => ({
        name: colName,
        type: mapDataTypeToSchemaType(fileSchema.data_types[colName])
      }));
      
      // Update edge metadata with schema
      const updatedMetadata = {
        ...(edge.metadata || {}),
        schema: { columns: schemaColumns }
      };
      
      const { error: updateError } = await supabase
        .from('workflow_edges')
        .update({ metadata: updatedMetadata })
        .eq('id', edge.id);
      
      if (updateError) {
        console.error('Error updating edge metadata with schema:', updateError);
        return false;
      }
      
      console.log('Successfully propagated schema from', sourceNodeId, 'to', targetNodeId);
      return true;
    } catch (error) {
      console.error('Error in propagateFileSchema:', error);
      return false;
    }
  };
  
  /**
   * Map Supabase data type to schema type
   */
  const mapDataTypeToSchemaType = (dataType: string): string => {
    if (!dataType) return 'string';
    
    const type = dataType.toLowerCase();
    
    if (type.includes('int') || type === 'number' || type === 'float' || type === 'decimal') {
      return 'number';
    }
    
    if (type.includes('date') || type.includes('time')) {
      return 'date';
    }
    
    if (type === 'boolean' || type === 'bool') {
      return 'boolean';
    }
    
    if (type.includes('json') || type === 'object') {
      return 'object';
    }
    
    if (type.includes('array')) {
      return 'array';
    }
    
    return 'string';
  };

  const contextValue: WorkflowContextType = {
    workflowId,
    isTemporaryId,
    generateTemporaryId,
    convertToDbWorkflowId: convertToDbWorkflowIdFn,
    formatWorkflowId: formatWorkflowIdFn,
    migrateTemporaryWorkflow,
    propagateFileSchema
  };

  return (
    <WorkflowContext.Provider value={contextValue}>
      {children}
    </WorkflowContext.Provider>
  );
};
