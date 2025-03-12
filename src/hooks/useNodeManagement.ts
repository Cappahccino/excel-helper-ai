
import { useState, useCallback, useEffect } from 'react';
import { WorkflowNode } from '@/types/workflow';
import { 
  createNode, 
  calculateNodePosition 
} from '@/components/workflow/factory/NodeFactory';
import { toast } from 'sonner';

export function useNodeManagement(
  setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>, 
  saveWorkflow: () => void
) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [schemaPropagationMap, setSchemaPropagationMap] = useState<Record<string, string[]>>({});
  
  // Track nodes that need schema updates when source nodes change
  const updateSchemaPropagationMap = useCallback((sourceId: string, targetId: string) => {
    setSchemaPropagationMap(prev => {
      const dependents = prev[sourceId] || [];
      if (!dependents.includes(targetId)) {
        return {
          ...prev,
          [sourceId]: [...dependents, targetId]
        };
      }
      return prev;
    });
  }, []);
  
  const handleNodeConfigUpdate = useCallback((nodeId: string, config: any) => {
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
    
    window.saveWorkflowTimeout = setTimeout(() => saveWorkflow(), 1000) as unknown as number;
  }, [saveWorkflow, setNodes]);

  const handleAddNode = useCallback((nodeType: string, nodeCategory: string, nodeLabel: string) => {
    setNodes((prevNodes) => {
      // Calculate a good position for the new node
      const position = calculateNodePosition(prevNodes);
      
      // Create the new node
      const newNode = createNode(nodeType, nodeCategory, nodeLabel, position);
      
      return [...prevNodes, newNode];
    });
  }, [setNodes]);
  
  const triggerSchemaUpdate = useCallback((sourceNodeId: string) => {
    // Get all dependent nodes for the source node
    const dependentNodes = schemaPropagationMap[sourceNodeId] || [];
    
    if (dependentNodes.length > 0) {
      console.log(`Triggering schema update from node ${sourceNodeId} to nodes:`, dependentNodes);
      toast.info(`Updating schema for ${dependentNodes.length} dependent node(s)`);
      
      // You could emit an event or use context to notify dependent nodes
      // This is a placeholder for the actual implementation
    }
  }, [schemaPropagationMap]);

  return {
    selectedNodeId,
    setSelectedNodeId,
    handleNodeConfigUpdate,
    handleAddNode,
    updateSchemaPropagationMap,
    triggerSchemaUpdate
  };
}
