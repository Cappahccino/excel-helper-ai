
import { NodeType, WorkflowNode, NodeComponentType, WorkflowNodeData } from '@/types/workflow';

// Map of node type to visual component type
const nodeTypeComponentMap: Record<string, NodeComponentType> = {
  'fileUpload': 'fileUpload',
  'directFileUpload': 'directFileUpload',
  'filtering': 'filtering',
  'aggregation': 'aggregation',
  'dataProcessing': 'dataProcessing',
  'aiNode': 'aiNode',
  'askAI': 'askAI',
  'outputNode': 'outputNode',
  'spreadsheetGenerator': 'spreadsheetGenerator'
};

// Default configurations for different node types
const defaultConfigs: Record<string, any> = {
  fileUpload: {
    fileId: null,
    hasHeaders: true
  },
  directFileUpload: {
    fileId: null,
    hasHeaders: true
  },
  filtering: {
    column: '',
    operator: 'equals',
    value: '',
    isCaseSensitive: true
  },
  aggregation: {
    function: 'sum',
    column: '',
    groupBy: ''
  }
};

// Calculate position for a new node based on existing nodes
export function calculateNodePosition(existingNodes: WorkflowNode[]) {
  if (!existingNodes.length) {
    return { x: 250, y: 100 };
  }

  // Find the rightmost node
  let rightmostNode = existingNodes[0];
  existingNodes.forEach(node => {
    if (node.position.x > rightmostNode.position.x) {
      rightmostNode = node;
    }
  });

  // Place the new node to the right with some spacing
  return {
    x: rightmostNode.position.x + 300,
    y: rightmostNode.position.y
  };
}

// Create a new node with fixed typing
export function createNode(
  nodeType: string, 
  nodeCategory: string, 
  nodeLabel: string, 
  position: { x: number, y: number }
): WorkflowNode {
  const uniqueId = `${nodeType}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  const componentType = nodeTypeComponentMap[nodeType] || 'dataProcessing';
  const defaultConfig = defaultConfigs[nodeType] || {};
  
  return {
    id: uniqueId,
    type: componentType,
    position,
    data: {
      label: nodeLabel,
      type: nodeType as NodeType,
      category: nodeCategory,
      config: { ...defaultConfig }
    } as WorkflowNodeData
  };
}
