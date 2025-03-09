
import { useState, useCallback } from 'react';
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
  UtilityNodeType
} from '@/types/workflow';

export function useNodeManagement(setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>, saveWorkflow: () => void) {
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
    const nodeId = `node-${uuidv4()}`;
    
    const nodeComponentType: NodeComponentType = (() => {
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
    })();

    const createNodeData = (): WorkflowNodeData => {
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
              prompt: ''
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
    };

    const newNode: WorkflowNode = {
      id: nodeId,
      type: nodeComponentType,
      position: { x: 100, y: 100 },
      data: createNodeData()
    };

    setNodes((prevNodes) => [...prevNodes, newNode]);
  };

  return {
    selectedNodeId,
    setSelectedNodeId,
    handleNodeConfigUpdate,
    handleAddNode
  };
}
