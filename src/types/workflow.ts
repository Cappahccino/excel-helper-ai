
import { Node, NodeProps as XyflowNodeProps, Edge } from '@xyflow/react';

// Define our own Json type since we can't import it from supabase
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

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
    filename?: string;
    sheets?: any[];
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

// Add Workflow Node type that combines XyFlow's Node type with our specific data
export type WorkflowNode = Node<WorkflowNodeData>;

// Workflow definition types
export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: Edge[];
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

// Additional types for workflow execution
export interface NodeExecutionContext {
  nodeId: string;
  inputs: NodeInputs;
  outputs: NodeOutputs;
  config: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
  is_template?: boolean;
  tags?: string[];
}

export interface WorkflowExecution {
  id?: string;
  workflow_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  node_states?: Record<string, any>;
  started_at?: string;
  completed_at?: string;
  error?: string;
  initiated_by?: string;
  logs?: any[];
}

// Helper functions for database mappings
export function mapDatabaseWorkflowToWorkflow(dbWorkflow: any): Workflow {
  let definition: WorkflowDefinition;
  
  if (typeof dbWorkflow.definition === 'string') {
    try {
      definition = JSON.parse(dbWorkflow.definition);
    } catch (e) {
      console.error('Error parsing workflow definition:', e);
      definition = { nodes: [], edges: [] };
    }
  } else if (dbWorkflow.definition && typeof dbWorkflow.definition === 'object') {
    definition = {
      nodes: Array.isArray(dbWorkflow.definition.nodes) ? dbWorkflow.definition.nodes : [],
      edges: Array.isArray(dbWorkflow.definition.edges) ? dbWorkflow.definition.edges : []
    };
  } else {
    definition = { nodes: [], edges: [] };
  }
  
  return {
    id: dbWorkflow.id,
    name: dbWorkflow.name || 'Untitled Workflow',
    description: dbWorkflow.description,
    definition,
    created_at: dbWorkflow.created_at,
    updated_at: dbWorkflow.updated_at,
    user_id: dbWorkflow.user_id,
    is_template: dbWorkflow.is_template,
    tags: dbWorkflow.tags
  };
}

export function mapWorkflowToDatabaseWorkflow(workflow: Workflow): any {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    definition: JSON.stringify(workflow.definition),
    user_id: workflow.user_id,
    is_template: workflow.is_template,
    tags: workflow.tags
  };
}

export function mapDatabaseExecutionToWorkflowExecution(dbExecution: any): WorkflowExecution {
  return {
    id: dbExecution.id,
    workflow_id: dbExecution.workflow_id,
    status: dbExecution.status,
    inputs: dbExecution.inputs,
    outputs: dbExecution.outputs,
    node_states: dbExecution.node_states,
    started_at: dbExecution.started_at,
    completed_at: dbExecution.completed_at,
    error: dbExecution.error,
    initiated_by: dbExecution.initiated_by,
    logs: dbExecution.logs
  };
}

export function mapWorkflowExecutionToDatabaseExecution(execution: WorkflowExecution): any {
  return {
    id: execution.id,
    workflow_id: execution.workflow_id,
    status: execution.status,
    inputs: execution.inputs,
    outputs: execution.outputs,
    node_states: execution.node_states,
    started_at: execution.started_at,
    completed_at: execution.completed_at,
    error: execution.error,
    initiated_by: execution.initiated_by,
    logs: execution.logs
  };
}
