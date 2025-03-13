
import { useState, useCallback, useEffect } from 'react';
import { WorkflowNode } from '@/types/workflow';
import { 
  createNode, 
  calculateNodePosition 
} from '@/components/workflow/factory/NodeFactory';
import { toast } from 'sonner';

/**
 * Type definition for schema column information
 */
export interface SchemaColumn {
  name: string;
  type: 'string' | 'text' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown';
}

/**
 * Type for schema mapping between nodes
 */
export interface SchemaPropagationMapping {
  [sourceNodeId: string]: {
    targetNodes: string[];
    lastUpdated?: number;
    schema?: SchemaColumn[];
  };
}

export function useNodeManagement(
  setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>, 
  saveWorkflow: () => void
) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [schemaPropagationMap, setSchemaPropagationMap] = useState<SchemaPropagationMapping>({});
  const [schemaCache, setSchemaCache] = useState<Record<string, SchemaColumn[]>>({});
  const [pendingSchemaUpdates, setPendingSchemaUpdates] = useState<Set<string>>(new Set());
  const [propagationInProgress, setPropagationInProgress] = useState<Record<string, boolean>>({});
  
  // Track nodes that need schema updates when source nodes change
  const updateSchemaPropagationMap = useCallback((sourceId: string, targetId: string) => {
    console.log(`Updating schema propagation map: ${sourceId} -> ${targetId}`);
    
    setSchemaPropagationMap(prev => {
      const existingMapping = prev[sourceId] || { targetNodes: [] };
      
      // Add target node to the list if it doesn't exist
      if (!existingMapping.targetNodes.includes(targetId)) {
        const updatedMapping = {
          ...prev,
          [sourceId]: {
            ...existingMapping,
            targetNodes: [...existingMapping.targetNodes, targetId],
            lastUpdated: Date.now()
          }
        };
        console.log('Updated propagation map:', updatedMapping);
        return updatedMapping;
      }
      return prev;
    });
    
    // Mark the target node as needing a schema update
    setPendingSchemaUpdates(prev => {
      const newSet = new Set(prev);
      newSet.add(targetId);
      return newSet;
    });
  }, []);
  
  // Update schema cache for a node
  const updateNodeSchema = useCallback((nodeId: string, schema: SchemaColumn[]) => {
    console.log(`Updating schema cache for node ${nodeId}:`, schema);
    
    setSchemaCache(prev => ({
      ...prev,
      [nodeId]: schema
    }));
    
    // Trigger schema updates for dependent nodes
    const mapping = schemaPropagationMap[nodeId];
    if (mapping && mapping.targetNodes.length > 0) {
      console.log(`Triggering schema updates for dependent nodes:`, mapping.targetNodes);
      
      // Mark all dependent nodes as needing updates
      setPendingSchemaUpdates(prev => {
        const newSet = new Set(prev);
        mapping.targetNodes.forEach(targetId => newSet.add(targetId));
        return newSet;
      });
    }
  }, [schemaPropagationMap]);
  
  const handleNodeConfigUpdate = useCallback((nodeId: string, config: any) => {
    console.log(`Handling node config update for ${nodeId}:`, config);
    
    setNodes((prevNodes) => {
      return prevNodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                ...config
              }
            }
          };
        }
        return node;
      });
    });

    if (window.saveWorkflowTimeout) {
      clearTimeout(window.saveWorkflowTimeout);
    }
    
    // Check if this is a schema-related config update (like selecting a file)
    if (config.fileId || config.schema) {
      // If we have schema information, update the schema cache
      if (config.schema) {
        console.log(`Schema found in config update for ${nodeId}`, config.schema);
        updateNodeSchema(nodeId, config.schema);
      } else {
        // Mark node as needing schema update
        console.log(`Marking node ${nodeId} as needing schema update (no schema in config)`);
        setPendingSchemaUpdates(prev => {
          const newSet = new Set(prev);
          newSet.add(nodeId);
          return newSet;
        });
      }
    }
    
    window.saveWorkflowTimeout = setTimeout(() => saveWorkflow(), 1000) as unknown as number;
  }, [saveWorkflow, setNodes, updateNodeSchema]);

  const handleAddNode = useCallback((nodeType: string, nodeCategory: string, nodeLabel: string) => {
    setNodes((prevNodes) => {
      // Calculate a good position for the new node
      const position = calculateNodePosition(prevNodes);
      
      // Create the new node
      const newNode = createNode(nodeType, nodeCategory, nodeLabel, position);
      console.log(`Created new node of type ${nodeType}:`, newNode);
      
      return [...prevNodes, newNode];
    });
  }, [setNodes]);
  
  /**
   * Get schema for a specific node
   */
  const getNodeSchema = useCallback((nodeId: string): SchemaColumn[] => {
    const schema = schemaCache[nodeId] || [];
    if (schema.length === 0) {
      console.log(`No schema found in cache for node ${nodeId}`);
    }
    return schema;
  }, [schemaCache]);
  
  /**
   * Check schema compatibility between nodes
   */
  const checkSchemaCompatibility = useCallback((sourceSchema: SchemaColumn[], targetConfig: any): { 
    isCompatible: boolean;
    errors: string[];
  } => {
    const errors: string[] = [];
    
    // No configuration needed for compatibility check
    if (!targetConfig) {
      return { isCompatible: true, errors: [] };
    }
    
    // If the target has column config, verify it exists in source schema
    if (targetConfig.column && sourceSchema.length > 0) {
      const columnExists = sourceSchema.some(col => col.name === targetConfig.column);
      if (!columnExists) {
        errors.push(`Column "${targetConfig.column}" does not exist in the source data`);
      } else {
        // Column exists, check type compatibility with operation
        const column = sourceSchema.find(col => col.name === targetConfig.column);
        
        if (targetConfig.operator && column) {
          const numericOperators = ['greater-than', 'less-than', 'between'];
          const stringOperators = ['contains', 'starts-with', 'ends-with'];
          
          if (column.type === 'number' && stringOperators.includes(targetConfig.operator)) {
            errors.push(`Operator "${targetConfig.operator}" cannot be used with numeric column "${targetConfig.column}"`);
          }
          
          if (column.type === 'string' && numericOperators.includes(targetConfig.operator)) {
            errors.push(`Operator "${targetConfig.operator}" cannot be used with text column "${targetConfig.column}"`);
          }
          
          // Check value compatibility
          if (targetConfig.value) {
            if (column.type === 'number' && isNaN(Number(targetConfig.value)) && targetConfig.operator !== 'equals') {
              errors.push(`Value "${targetConfig.value}" is not a valid number for column "${targetConfig.column}"`);
            }
            
            if (column.type === 'date' && isNaN(Date.parse(targetConfig.value)) && ['before', 'after', 'between'].includes(targetConfig.operator)) {
              errors.push(`Value "${targetConfig.value}" is not a valid date for column "${targetConfig.column}"`);
            }
          }
        }
      }
    }
    
    return { isCompatible: errors.length === 0, errors };
  }, []);
  
  const triggerSchemaUpdate = useCallback((sourceNodeId: string) => {
    // Get all dependent nodes for the source node
    const mapping = schemaPropagationMap[sourceNodeId];
    
    if (mapping && mapping.targetNodes.length > 0) {
      console.log(`Triggering schema update from node ${sourceNodeId} to nodes:`, mapping.targetNodes);
      toast.info(`Updating schema for ${mapping.targetNodes.length} dependent node(s)`);
      
      // Mark all dependent nodes as needing schema updates
      setPendingSchemaUpdates(prev => {
        const newSet = new Set(prev);
        mapping.targetNodes.forEach(targetId => {
          newSet.add(targetId);
          
          // Also mark propagation as in progress
          setPropagationInProgress(prev => ({
            ...prev,
            [`${sourceNodeId}-${targetId}`]: true
          }));
        });
        return newSet;
      });
      
      // Clear propagation status after a timeout to prevent hanging state
      setTimeout(() => {
        mapping.targetNodes.forEach(targetId => {
          setPropagationInProgress(prev => ({
            ...prev,
            [`${sourceNodeId}-${targetId}`]: false
          }));
        });
      }, 5000);
    } else {
      console.log(`No target nodes found for source node ${sourceNodeId} in propagation map`);
    }
  }, [schemaPropagationMap]);

  const forcePropagateSchemaToAllTargets = useCallback(() => {
    console.log('Force propagating schema to all targets');
    
    // For each source node in the propagation map
    Object.keys(schemaPropagationMap).forEach(sourceId => {
      triggerSchemaUpdate(sourceId);
    });
  }, [schemaPropagationMap, triggerSchemaUpdate]);

  // Add debug function to help troubleshoot
  const getDebugInfo = useCallback(() => {
    return {
      schemaPropagationMap,
      schemaCache,
      pendingSchemaUpdates: Array.from(pendingSchemaUpdates),
      propagationInProgress
    };
  }, [schemaPropagationMap, schemaCache, pendingSchemaUpdates, propagationInProgress]);

  return {
    selectedNodeId,
    setSelectedNodeId,
    handleNodeConfigUpdate,
    handleAddNode,
    updateSchemaPropagationMap,
    triggerSchemaUpdate,
    getNodeSchema,
    updateNodeSchema,
    checkSchemaCompatibility,
    pendingSchemaUpdates,
    schemaCache,
    forcePropagateSchemaToAllTargets,
    getDebugInfo,
    propagationInProgress
  };
}
