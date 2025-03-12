
import { useState, useCallback } from 'react';
import { WorkflowNode } from '@/types/workflow';
import { 
  createNode, 
  calculateNodePosition 
} from '@/components/workflow/factory/NodeFactory';

export function useNodeManagement(
  setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>, 
  saveWorkflow: () => void
) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  const handleNodeConfigUpdate = (nodeId: string, config: any) => {
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
  };

  const handleAddNode = (nodeType: string, nodeCategory: string, nodeLabel: string) => {
    setNodes((prevNodes) => {
      // Calculate a good position for the new node
      const position = calculateNodePosition(prevNodes);
      
      // Create the new node
      const newNode = createNode(nodeType, nodeCategory, nodeLabel, position);
      
      return [...prevNodes, newNode];
    });
  };

  return {
    selectedNodeId,
    setSelectedNodeId,
    handleNodeConfigUpdate,
    handleAddNode
  };
}
