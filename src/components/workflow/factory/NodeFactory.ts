
import { v4 as uuidv4 } from 'uuid';
import { 
  WorkflowNode, 
  NodeComponentType,
  WorkflowNodeData,
  InputNodeType,
  ProcessingNodeType,
  AINodeType,
  OutputNodeType,
  IntegrationNodeType,
  ControlNodeType,
  UtilityNodeType,
  DataInputNodeData,
  DataProcessingNodeData,
  AINodeData,
  OutputNodeData,
  IntegrationNodeData,
  ControlNodeData,
  SpreadsheetGeneratorNodeData,
  UtilityNodeData,
  FileUploadNodeData
} from '@/types/workflow';

// Map node type categories to their corresponding component types
export function mapNodeTypeToComponentType(nodeType: string, nodeCategory: string): NodeComponentType {
  switch (nodeCategory) {
    case 'input': 
      if (nodeType === 'fileUpload') {
        return 'fileUpload';
      }
      if (nodeType === 'spreadsheetGenerator') {
        return 'spreadsheetGenerator';
      }
      return 'dataInput';
    case 'processing': return 'dataProcessing';
    case 'ai': 
      if (nodeType === 'askAI') {
        return 'askAI';
      }
      return 'aiNode';
    case 'output': return 'outputNode';
    case 'integration': return 'integrationNode';
    case 'control': return 'controlNode';
    case 'utility': return 'utilityNode';
    default: return 'dataInput';
  }
}

// Create default node data based on node type
export function createNodeData(nodeType: string, nodeComponentType: NodeComponentType, nodeLabel: string): WorkflowNodeData {
  const baseData = {
    label: nodeLabel || 'New Node',
    config: {}
  };

  switch (nodeComponentType) {
    case 'fileUpload':
      return {
        ...baseData,
        type: 'fileUpload' as const,
        config: {}
      };
    case 'spreadsheetGenerator':
      return {
        ...baseData,
        type: 'spreadsheetGenerator' as const,
        config: {
          filename: 'generated',
          fileExtension: 'xlsx',
          sheets: [{ name: 'Sheet1', columns: [] }]
        }
      };
    case 'dataInput':
      return {
        ...baseData,
        type: nodeType as InputNodeType,
        config: {}
      };
    case 'dataProcessing':
      return createDataProcessingNodeData(nodeType, baseData);
    case 'aiNode':
      return {
        ...baseData,
        type: nodeType as AINodeType,
        config: {}
      };
    case 'askAI':
      return {
        ...baseData,
        type: 'askAI' as AINodeType,
        config: {
          aiProvider: 'openai', 
          modelName: 'gpt-4o-mini',
          prompt: '',
          systemMessage: ''
        }
      };
    case 'outputNode':
      return {
        ...baseData,
        type: nodeType as OutputNodeType,
        config: {}
      };
    case 'integrationNode':
      return {
        ...baseData,
        type: nodeType as IntegrationNodeType,
        config: {}
      };
    case 'controlNode':
      return {
        ...baseData,
        type: nodeType as ControlNodeType,
        config: {}
      };
    case 'utilityNode':
      return {
        ...baseData,
        type: nodeType as UtilityNodeType,
        config: {}
      };
    default:
      return {
        ...baseData,
        type: 'dataInput' as InputNodeType,
        config: {}
      };
  }
}

// Helper function to create specific data processing node configurations
function createDataProcessingNodeData(
  nodeType: string, 
  baseData: { label: string; config: Record<string, any> }
): DataProcessingNodeData {
  return {
    ...baseData,
    type: nodeType as ProcessingNodeType,
    config: {
      operation: nodeType,
      ...(nodeType === 'filtering' && {
        column: '',
        operator: 'equals',
        value: ''
      }),
      ...(nodeType === 'sorting' && {
        column: '',
        order: 'ascending'
      }),
      ...(nodeType === 'aggregation' && {
        function: 'sum',
        column: '',
        groupBy: ''
      }),
      ...(nodeType === 'formulaCalculation' && {
        description: '',
        applyTo: []
      }),
      ...(nodeType === 'textTransformation' && {
        column: '',
        transformation: 'uppercase'
      }),
      ...(nodeType === 'dataTypeConversion' && {
        column: '',
        fromType: 'text',
        toType: 'number'
      }),
      ...(nodeType === 'dateFormatting' && {
        column: '',
        format: 'MM/DD/YYYY'
      }),
      ...(nodeType === 'pivotTable' && {
        rows: [],
        columns: [],
        values: []
      }),
      ...(nodeType === 'joinMerge' && {
        leftKey: '',
        rightKey: '',
        joinType: 'inner'
      }),
      ...(nodeType === 'deduplication' && {
        columns: [],
        caseSensitive: true
      })
    }
  };
}

// Create a new node with position, type and data
export function createNode(
  nodeType: string, 
  nodeCategory: string, 
  nodeLabel: string, 
  position = { x: 100, y: 100 }
): WorkflowNode {
  const nodeId = `node-${uuidv4()}`;
  const nodeComponentType = mapNodeTypeToComponentType(nodeType, nodeCategory);
  const nodeData = createNodeData(nodeType, nodeComponentType, nodeLabel);

  return {
    id: nodeId,
    type: nodeComponentType,
    position,
    data: nodeData
  };
}

// Calculate an appropriate position for a new node based on existing nodes
export function calculateNodePosition(existingNodes: WorkflowNode[]): { x: number; y: number } {
  if (existingNodes.length === 0) {
    return { x: 100, y: 100 };
  }

  // Find the rightmost and bottommost node
  let maxX = 0;
  let maxY = 0;
  
  existingNodes.forEach(node => {
    if (node.position.x > maxX) {
      maxX = node.position.x;
    }
    if (node.position.y > maxY) {
      maxY = node.position.y;
    }
  });

  // Place the new node in a grid-like pattern
  if (maxX > 500) {
    // Start a new row
    return { x: 100, y: maxY + 150 };
  } else {
    // Place to the right
    return { x: maxX + 200, y: maxY };
  }
}

// Determine if a node requires schema information
export function nodeRequiresSchema(nodeType: NodeComponentType): boolean {
  return ['dataProcessing', 'askAI', 'spreadsheetGenerator'].includes(nodeType);
}

// Determine if a node provides schema information
export function nodeProvidesPossibleSchema(nodeType: NodeComponentType): boolean {
  return ['fileUpload', 'dataInput', 'dataProcessing'].includes(nodeType);
}

// Get default operators for a filter based on column type
export function getOperatorsForColumnType(columnType: string): { value: string, label: string }[] {
  switch (columnType) {
    case 'number':
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'not-equals', label: 'Not Equals' },
        { value: 'greater-than', label: 'Greater Than' },
        { value: 'less-than', label: 'Less Than' },
        { value: 'between', label: 'Between' },
        { value: 'is-empty', label: 'Is Empty' },
        { value: 'is-not-empty', label: 'Is Not Empty' }
      ];
    case 'date':
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'not-equals', label: 'Not Equals' },
        { value: 'after', label: 'After' },
        { value: 'before', label: 'Before' },
        { value: 'between', label: 'Between' },
        { value: 'is-empty', label: 'Is Empty' },
        { value: 'is-not-empty', label: 'Is Not Empty' }
      ];
    case 'boolean':
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'not-equals', label: 'Not Equals' },
      ];
    default: // string or other types
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'not-equals', label: 'Not Equals' },
        { value: 'contains', label: 'Contains' },
        { value: 'starts-with', label: 'Starts With' },
        { value: 'ends-with', label: 'Ends With' },
        { value: 'is-empty', label: 'Is Empty' },
        { value: 'is-not-empty', label: 'Is Not Empty' }
      ];
  }
}
