import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { Edge, WorkflowNode } from '@/types/workflow';
import { supabase, convertToDbWorkflowId, isTemporaryWorkflowId } from '@/integrations/supabase/client';
import { propagateSchema as dbPropagateSchema } from '@/utils/fileSchemaUtils';

export interface SchemaColumn {
  name: string;
  type: 'string' | 'text' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown';
}

export function useNodeManagement(
  setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>,
  saveWorkflow: () => Promise<string | null>
) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [nodeSchemas, setNodeSchemas] = useState<Record<string, SchemaColumn[]>>({});
  const [schemaProcessed, setSchemaProcessed] = useState<Record<string, boolean>>({});
  const schemaPropagationMap = useRef<Record<string, string[]>>({});

  // Function to handle node configuration updates
  const handleNodeConfigUpdate = useCallback((nodeId: string, config: any) => {
    setNodes(prevNodes => 
      prevNodes.map(node => 
        node.id === nodeId 
          ? { ...node, data: { ...node.data, config: { ...config } } } 
          : node
      )
    );

    // Schedule a save operation (debounced in the parent component)
    saveWorkflow();
  }, [setNodes, saveWorkflow]);

  // Function to add a new node with the appropriate node type and label
  const handleAddNode = useCallback((nodeType: string, nodeCategory: string, nodeLabel: string = 'New Node') => {
    const newNodeId = `node-${uuidv4()}`;
    const position = { x: Math.random() * 300, y: Math.random() * 300 };
    
    const newNode: WorkflowNode = {
      id: newNodeId,
      type: nodeType,
      position,
      data: {
        label: nodeLabel,
        type: nodeType,
        category: nodeCategory,
        config: {},
        onChange: handleNodeConfigUpdate
      }
    };
    
    setNodes(prevNodes => [...prevNodes, newNode]);
    setSelectedNodeId(newNodeId);
    
    // Return the new node ID for further operations
    return newNodeId;
  }, [setNodes, handleNodeConfigUpdate]);

  // Function to update schema propagation map
  const updateSchemaPropagationMap = useCallback((sourceNodeId: string, targetNodeId: string) => {
    schemaPropagationMap.current[sourceNodeId] = [
      ...(schemaPropagationMap.current[sourceNodeId] || []),
      targetNodeId
    ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
    
    console.log(`Updated schema propagation map: ${sourceNodeId} -> [${schemaPropagationMap.current[sourceNodeId].join(', ')}]`);
  }, []);

  // Function to remove a node from schema propagation map
  const removeFromSchemaPropagationMap = useCallback((nodeId: string) => {
    // Remove as source
    delete schemaPropagationMap.current[nodeId];
    
    // Remove as target
    Object.keys(schemaPropagationMap.current).forEach(sourceId => {
      schemaPropagationMap.current[sourceId] = schemaPropagationMap.current[sourceId].filter(
        targetId => targetId !== nodeId
      );
    });
    
    console.log(`Removed node ${nodeId} from schema propagation map`);
  }, []);

  // Function to trigger schema updates for a node and its dependent nodes
  const triggerSchemaUpdate = useCallback(async (sourceNodeId: string) => {
    try {
      console.log(`Triggering schema update for source node: ${sourceNodeId}`);
      
      const targetNodeIds = schemaPropagationMap.current[sourceNodeId] || [];
      if (targetNodeIds.length === 0) {
        console.log(`No target nodes found for source: ${sourceNodeId}`);
        return;
      }
      
      console.log(`Found target nodes: ${targetNodeIds.join(', ')}`);
      
      // Check if source node has a schema
      const sourceSchema = nodeSchemas[sourceNodeId];
      if (!sourceSchema || sourceSchema.length === 0) {
        console.log(`Source node ${sourceNodeId} has no schema to propagate yet`);
        return;
      }
      
      console.log(`Source schema available with ${sourceSchema.length} columns`);
      
      // Propagate schema to all target nodes
      // This will be handled by the workflow context's propagateSchema function
      
      // Mark all target nodes as processed
      const updatedSchemaProcessed = { ...schemaProcessed };
      targetNodeIds.forEach(targetNodeId => {
        updatedSchemaProcessed[targetNodeId] = true;
      });
      setSchemaProcessed(updatedSchemaProcessed);
      
      console.log(`Schema update triggered for ${targetNodeIds.length} target nodes`);
    } catch (error) {
      console.error('Error triggering schema update:', error);
    }
  }, [nodeSchemas, schemaProcessed]);

  // Function to get schema for a node
  const getNodeSchema = useCallback(async (
    workflowId: string, 
    nodeId: string, 
    options: { forceRefresh?: boolean } = {}
  ): Promise<SchemaColumn[]> => {
    try {
      console.log(`Getting schema for node ${nodeId} in workflow ${workflowId}`);
      
      // Set loading state
      setIsLoading(prev => ({ ...prev, [nodeId]: true }));
      
      // Return cached schema if available and not forcing refresh
      if (nodeSchemas[nodeId] && !options.forceRefresh) {
        console.log(`Using cached schema for node ${nodeId}`);
        setIsLoading(prev => ({ ...prev, [nodeId]: false }));
        return nodeSchemas[nodeId];
      }
      
      // For temporary workflows, we use in-memory data
      if (isTemporaryWorkflowId(workflowId)) {
        console.log(`Workflow ${workflowId} is temporary, will use in-memory data`);
        setIsLoading(prev => ({ ...prev, [nodeId]: false }));
        return nodeSchemas[nodeId] || [];
      }
      
      // For permanent workflows, fetch from database
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
      
      if (error) {
        console.error(`Error fetching schema for node ${nodeId}:`, error);
        setIsLoading(prev => ({ ...prev, [nodeId]: false }));
        return [];
      }
      
      if (data && data.columns && data.data_types) {
        const schema: SchemaColumn[] = data.columns.map((column: string) => ({
          name: column,
          type: (data.data_types[column] || 'unknown') as any
        }));
        
        console.log(`Retrieved schema for node ${nodeId} with ${schema.length} columns`);
        
        // Cache the schema
        setNodeSchemas(prev => ({ ...prev, [nodeId]: schema }));
        setIsLoading(prev => ({ ...prev, [nodeId]: false }));
        
        return schema;
      }
      
      setIsLoading(prev => ({ ...prev, [nodeId]: false }));
      return [];
    } catch (error) {
      console.error(`Error in getNodeSchema for node ${nodeId}:`, error);
      setIsLoading(prev => ({ ...prev, [nodeId]: false }));
      return [];
    }
  }, [nodeSchemas]);

  // Function to update schema for a node
  const updateNodeSchema = useCallback(async (
    workflowId: string, 
    nodeId: string, 
    schema: SchemaColumn[]
  ): Promise<boolean> => {
    try {
      console.log(`Updating schema for node ${nodeId} in workflow ${workflowId}`);
      console.log('Schema:', schema);
      
      // Cache the schema immediately for better UX
      setNodeSchemas(prev => ({ ...prev, [nodeId]: schema }));
      
      // For temporary workflows, just keep in memory
      if (isTemporaryWorkflowId(workflowId)) {
        console.log(`Workflow ${workflowId} is temporary, storing schema in memory only`);
        return true;
      }
      
      // For permanent workflows, persist to database
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // Convert schema to database format
      const columns = schema.map(col => col.name);
      const dataTypes = schema.reduce((acc, col) => {
        acc[col.name] = col.type;
        return acc;
      }, {} as Record<string, string>);
      
      const { error } = await supabase
        .from('workflow_file_schemas')
        .upsert({
          workflow_id: dbWorkflowId,
          node_id: nodeId,
          file_id: '00000000-0000-0000-0000-000000000000', // Placeholder for schema without a file
          columns,
          data_types: dataTypes,
          is_temporary: isTemporaryWorkflowId(workflowId),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'workflow_id,node_id'
        });
      
      if (error) {
        console.error(`Error updating schema for node ${nodeId}:`, error);
        return false;
      }
      
      console.log(`Successfully updated schema for node ${nodeId}`);
      
      // Trigger propagation to dependent nodes
      triggerSchemaUpdate(nodeId);
      
      return true;
    } catch (error) {
      console.error(`Error in updateNodeSchema for node ${nodeId}:`, error);
      return false;
    }
  }, [triggerSchemaUpdate]);

  // Function to check schema compatibility between nodes
  const checkSchemaCompatibility = useCallback((
    sourceSchema: SchemaColumn[], 
    targetConfig: any
  ): { isCompatible: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // If target doesn't have config or source doesn't have schema, it's compatible
    if (!targetConfig || sourceSchema.length === 0) {
      return { isCompatible: true, errors: [] };
    }
    
    // Check if columns referenced in target config exist in source schema
    if (targetConfig.column && !sourceSchema.some(col => col.name === targetConfig.column)) {
      errors.push(`Column "${targetConfig.column}" referenced in the configuration doesn't exist in the source data`);
    }
    
    // Type compatibility checks
    if (targetConfig.column) {
      const column = sourceSchema.find(col => col.name === targetConfig.column);
      const operator = targetConfig.operator;
      
      if (column && operator) {
        // String operators used on non-string columns
        if ((column.type === 'number' || column.type === 'boolean') && 
            ['contains', 'starts-with', 'ends-with'].includes(operator)) {
          errors.push(`Operator "${operator}" can't be used with ${column.type} column "${column.name}"`);
        }
        
        // Numeric operators used on non-numeric columns
        if ((column.type === 'string' || column.type === 'text') && 
            ['greater-than', 'less-than'].includes(operator)) {
          errors.push(`Operator "${operator}" can't be used with text column "${column.name}"`);
        }
      }
    }
    
    return { 
      isCompatible: errors.length === 0,
      errors 
    };
  }, []);

  return {
    selectedNodeId,
    setSelectedNodeId,
    handleNodeConfigUpdate,
    handleAddNode,
    updateSchemaPropagationMap,
    removeFromSchemaPropagationMap,
    triggerSchemaUpdate,
    getNodeSchema,
    updateNodeSchema,
    checkSchemaCompatibility,
    isLoading,
    validationErrors
  };
}
