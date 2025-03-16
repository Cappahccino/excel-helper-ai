
import { v4 as uuidv4 } from 'uuid';
import { WorkflowNode, NodeType, Edge } from '@/types/workflow';

// Define the node categories
export type NodeCategory =
  | 'input'
  | 'processing'
  | 'ai'
  | 'output'
  | 'integration'
  | 'control'
  | 'utility';

// Map of node types to their display names
const NODE_TYPE_NAMES: Record<string, string> = {
  dataInput: 'Data Input',
  dataProcessing: 'Data Processing',
  aiNode: 'AI Analysis',
  askAI: 'Ask AI',
  outputNode: 'Output',
  integrationNode: 'Integration',
  controlNode: 'Control Flow',
  spreadsheetGenerator: 'Spreadsheet Generator',
  utilityNode: 'Utility',
  fileUpload: 'File Upload',
  directUpload: 'Direct File Upload',
  filtering: 'Data Filter',
  aggregation: 'Data Aggregation'
};

// Create a new node with the given type and position
export function createNode(
  type: string,
  category: string,
  label: string,
  position = { x: 0, y: 0 }
): WorkflowNode {
  const nodeId = `${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const displayLabel = label || NODE_TYPE_NAMES[type] || 'Node';

  return {
    id: nodeId,
    type: type as NodeType,
    position,
    data: {
      label: displayLabel,
      type: type,
      category: category,
      config: {}
    }
  };
}

// Calculate a good position for a new node based on existing nodes
export function calculateNodePosition(
  nodes: WorkflowNode[],
  margin = 50
): { x: number; y: number } {
  if (nodes.length === 0) {
    return { x: 100, y: 100 };
  }

  // Find the rightmost node
  let rightmostNode = nodes[0];
  let bottomNode = nodes[0];

  for (const node of nodes) {
    if (node.position.x > rightmostNode.position.x) {
      rightmostNode = node;
    }
    if (node.position.y > bottomNode.position.y) {
      bottomNode = node;
    }
  }

  // Place new node to the right of the rightmost node
  // or below the bottom node if there's not enough horizontal space
  return {
    x: rightmostNode.position.x + 300 + margin,
    y: rightmostNode.position.y
  };
}

// Connect source and target nodes with an edge
export function createEdge(
  sourceNode: WorkflowNode,
  targetNode: WorkflowNode
): Edge {
  return {
    id: `edge-${uuidv4()}`,
    source: sourceNode.id,
    target: targetNode.id,
    type: 'default' // Could be 'step', 'smoothstep', 'straight', etc.
  };
}

// Create a node configuration based on node type
export function createNodeConfig(type: string): Record<string, any> {
  // Base configuration for all nodes
  const baseConfig = {};

  // Type-specific configurations
  switch (type) {
    case 'fileUpload':
      return {
        ...baseConfig,
        fileId: null,
        filename: null,
        hasHeaders: true,
        delimiter: ','
      };
    case 'directUpload':
      return {
        ...baseConfig,
        fileId: null,
        filename: null,
        hasHeaders: true,
        delimiter: ','
      };
    case 'dataProcessing':
      return {
        ...baseConfig,
        transformations: []
      };
    case 'aiNode':
      return {
        ...baseConfig,
        aiProvider: 'openai',
        modelName: 'gpt-4o',
        prompt: 'Analyze the following data:'
      };
    case 'askAI':
      return {
        ...baseConfig,
        aiProvider: 'openai',
        modelName: 'gpt-4o',
        prompt: '',
        systemMessage: 'You are a helpful assistant.'
      };
    case 'outputNode':
      return {
        ...baseConfig,
        format: 'json',
        destination: 'download'
      };
    case 'filtering':
      return {
        ...baseConfig,
        column: '',
        operator: 'equals',
        value: '',
        caseSensitive: false
      };
    case 'aggregation':
      return {
        ...baseConfig,
        groupByColumn: '',
        aggregations: []
      };
    default:
      return baseConfig;
  }
}
