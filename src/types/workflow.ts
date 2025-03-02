
import { Node, NodeProps as XyflowNodeProps } from '@xyflow/react';
import { Json } from './common';

// Node data types
export interface BaseNodeData {
  label: string;
  type: string;
  config: Record<string, any>;
}

export interface DataInputNodeData extends BaseNodeData {
  type: 'excelInput' | 'csvInput' | 'apiSource' | 'userInput';
  config: {
    fileId?: string | null;
    hasHeaders?: boolean;
    delimiter?: string;
    endpoint?: string;
    fields?: any[];
    [key: string]: any;
  };
}

export interface DataProcessingNodeData extends BaseNodeData {
  type: 'dataTransform' | 'dataCleaning' | 'formulaNode' | 'filterNode';
  config: {
    operations?: any[];
    rules?: any[];
    formula?: string;
    conditions?: any[];
    [key: string]: any;
  };
}

export interface AINodeData extends BaseNodeData {
  type: 'aiAnalyze' | 'aiClassify' | 'aiSummarize';
  config: {
    analysisOptions?: {
      detectOutliers?: boolean;
      findPatterns?: boolean;
      [key: string]: any;
    };
    analysisType?: string;
    classificationOptions?: {
      categories?: string[];
      [key: string]: any;
    };
    prompt?: string;
    [key: string]: any;
  };
}

export interface OutputNodeData extends BaseNodeData {
  type: 'excelOutput' | 'dashboardOutput' | 'emailNotify';
  config: {
    filename?: string;
    format?: string;
    visualizations?: any[];
    recipients?: string[];
    [key: string]: any;
  };
}

export interface IntegrationNodeData extends BaseNodeData {
  type: 'xeroConnect' | 'salesforceConnect' | 'googleSheetsConnect';
  config: {
    operation?: string;
    credentials?: any;
    spreadsheetId?: string;
    [key: string]: any;
  };
}

export interface ControlNodeData extends BaseNodeData {
  type: 'conditionalBranch' | 'loopNode' | 'mergeNode';
  config: {
    conditions?: any[];
    loopType?: string;
    mergeStrategy?: string;
    [key: string]: any;
  };
}

export interface SpreadsheetGeneratorNodeData extends BaseNodeData {
  type: 'spreadsheetGenerator';
  config: {
    filename: string;
    sheets: any[];
    [key: string]: any;
  };
}

export type WorkflowNodeData = 
  | DataInputNodeData 
  | DataProcessingNodeData 
  | AINodeData 
  | OutputNodeData 
  | IntegrationNodeData 
  | ControlNodeData 
  | SpreadsheetGeneratorNodeData;

// Modified XyFlow node props with specific data type
export type NodeProps<T extends BaseNodeData = BaseNodeData> = XyflowNodeProps<T>;

// Workflow definition types
export interface WorkflowDefinition {
  nodes: Node<WorkflowNodeData>[];
  edges: any[];
}

// Node definition types
export interface NodeTypeDefinition {
  type: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  defaultConfig: Record<string, any>;
  inputs: Array<{
    name: string;
    type: string;
    dataType?: string;
  }>;
  outputs: Array<{
    name: string;
    type: string;
    dataType?: string;
  }>;
}

export type NodeType = 
  | 'excelInput' | 'csvInput' | 'apiSource' | 'userInput'
  | 'dataTransform' | 'dataCleaning' | 'formulaNode' | 'filterNode'
  | 'aiAnalyze' | 'aiClassify' | 'aiSummarize'
  | 'excelOutput' | 'dashboardOutput' | 'emailNotify'
  | 'xeroConnect' | 'salesforceConnect' | 'googleSheetsConnect'
  | 'conditionalBranch' | 'loopNode' | 'mergeNode'
  | 'spreadsheetGenerator';

// Node execution types
export interface NodeInputs {
  [key: string]: any;
}

export interface NodeOutputs {
  [key: string]: any;
}

export interface NodeHandler {
  execute: (inputs: NodeInputs, config: Record<string, any>) => Promise<NodeOutputs>;
}

// Define the registry of node types
export const NODE_TYPES: Partial<Record<NodeType, NodeTypeDefinition>> = {
  excelInput: {
    type: 'excelInput',
    name: 'Excel Input',
    category: 'input',
    description: 'Reads data from an Excel file',
    icon: 'file-spreadsheet',
    defaultConfig: {
      fileId: null
    },
    inputs: [],
    outputs: [
      {
        name: 'data',
        type: 'data',
        dataType: 'object'
      }
    ]
  }
  // Add more node type definitions as needed
};
