// src/types/workflow.ts

export type NodeType = 
  // Data Sources
  | 'excelInput' 
  | 'csvInput' 
  | 'apiSource'
  | 'userInput'
  // Processing
  | 'dataTransform' 
  | 'dataCleaning'
  | 'formulaNode'
  | 'filterNode'
  // AI
  | 'aiAnalyze' 
  | 'aiClassify'
  | 'aiSummarize'
  // Integration
  | 'xeroConnect'
  | 'salesforceConnect'
  | 'googleSheetsConnect'
  // Output
  | 'excelOutput'
  | 'dashboardOutput'
  | 'emailNotify'
  | 'spreadsheetGenerator'
  // Control
  | 'conditionalBranch'
  | 'loopNode'
  | 'mergeNode';

export interface NodeDefinition {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    description?: string;
    config: Record<string, any>;
    inputs: InputDefinition[];
    outputs: OutputDefinition[];
  };
}

export interface InputDefinition {
  id: string;
  name: string;
  type: 'data' | 'control' | 'parameter';
  dataType?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default?: any;
}

export interface OutputDefinition {
  id: string;
  name: string;
  type: 'data' | 'control';
  dataType?: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

export interface EdgeDefinition {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  status: 'draft' | 'published' | 'archived';
  triggerType: 'manual' | 'scheduled' | 'event';
  triggerConfig?: {
    schedule?: string; // CRON expression for scheduled workflows
    event?: {
      type: string;
      conditions: Record<string, any>;
    };
  };
  integrations: {
    type: string;
    config: Record<string, any>;
  }[];
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  startedAt: string;
  completedAt?: string;
  nodeStates: Record<string, {
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt?: string;
    completedAt?: string;
    error?: string;
    output?: any;
  }>;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  logs: {
    timestamp: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    nodeId?: string;
  }[];
}

// Node Registry to manage all available node types and their configurations
export interface NodeTypeDefinition {
  type: NodeType;
  name: string;
  category: 'input' | 'processing' | 'ai' | 'integration' | 'output' | 'control';
  description: string;
  icon: string;
  defaultConfig: Record<string, any>;
  inputs: Omit<InputDefinition, 'id'>[];
  outputs: Omit<OutputDefinition, 'id'>[];
  configUI?: React.FC<{
    config: Record<string, any>;
    onChange: (config: Record<string, any>) => void;
  }>;
  validate?: (config: Record<string, any>) => { valid: boolean; errors?: string[] };
}

export const NODE_TYPES: Record<NodeType, NodeTypeDefinition> = {
  // This would contain definitions for all node types
  // Example for one node type:
  excelInput: {
    type: 'excelInput',
    name: 'Excel Input',
    category: 'input',
    description: 'Import data from an Excel file',
    icon: 'table',
    defaultConfig: { fileId: null },
    inputs: [],
    outputs: [
      {
        name: 'data',
        type: 'data',
        dataType: 'object',
      }
    ],
    // The rest would be defined similarly
  },
  // ... other node definitions
} as Record<NodeType, NodeTypeDefinition>; // This would be properly filled out
