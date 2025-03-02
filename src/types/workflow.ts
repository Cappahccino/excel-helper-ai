
import { WorkflowDatabaseTypes } from './workflowDatabase';
import { Json } from '@/types/supabase';

// Node types
export type NodeType = 
  | 'excelInput' 
  | 'csvInput' 
  | 'apiSource' 
  | 'userInput' 
  | 'dataTransform' 
  | 'filter' 
  | 'sort' 
  | 'merge' 
  | 'aiAnalysis' 
  | 'visualize' 
  | 'export' 
  | 'notification' 
  | 'conditionalBranch' 
  | 'loop' 
  | 'delay' 
  | 'apiCall' 
  | 'spreadsheetGenerator' 
  | 'emailSender' 
  | 'schedule' 
  | 'webhook';

export type NodeCategory = 'input' | 'processing' | 'output' | 'ai' | 'control' | 'integration';

export interface NodeBase {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, any>;
}

export interface NodePort {
  name: string;
  type: 'data' | 'control' | 'event';
  dataType?: string;
}

export interface NodeTypeDefinition {
  type: NodeType;
  name: string;
  category: NodeCategory;
  description: string;
  icon: string;
  defaultConfig: Record<string, any>;
  inputs: NodePort[];
  outputs: NodePort[];
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowDefinition {
  nodes: NodeBase[];
  edges: Edge[];
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  status: 'draft' | 'active' | 'archived';
  triggerType: 'manual' | 'scheduled' | 'event';
  triggerConfig?: Record<string, any>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failed' | 'pending';
  version: number;
  isTemplate: boolean;
  folderId?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  initiatedBy?: string;
  nodeStates: Record<string, any>;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  error?: string;
  logs?: Array<{
    timestamp: string;
    level: 'info' | 'warning' | 'error';
    nodeId?: string;
    message: string;
    details?: any;
  }>;
}

// Node data interfaces
export interface NodeData {
  label: string;
  type: NodeType;
  config: Record<string, any>;
}

export interface NodeInputs {
  [key: string]: any;
}

export interface NodeOutputs {
  [key: string]: any;
}

export interface NodeExecutionContext {
  workflowId: string;
  executionId: string;
  userId?: string;
  log: (level: 'info' | 'warning' | 'error', message: string, details?: any) => void;
}

export type NodeHandler = (
  node: NodeBase,
  inputs: NodeInputs,
  context: NodeExecutionContext
) => Promise<NodeOutputs>;

// Add mapping for converting from database types to application types
export function mapDatabaseWorkflowToWorkflow(dbWorkflow: WorkflowDatabaseTypes['workflows']): Workflow {
  return {
    id: dbWorkflow.id,
    name: dbWorkflow.name,
    description: dbWorkflow.description || undefined,
    definition: dbWorkflow.definition as unknown as WorkflowDefinition,
    status: dbWorkflow.status as 'draft' | 'active' | 'archived',
    triggerType: dbWorkflow.trigger_type as 'manual' | 'scheduled' | 'event',
    triggerConfig: dbWorkflow.trigger_config as Record<string, any> | undefined,
    createdBy: dbWorkflow.created_by,
    createdAt: dbWorkflow.created_at,
    updatedAt: dbWorkflow.updated_at,
    lastRunAt: dbWorkflow.last_run_at || undefined,
    lastRunStatus: dbWorkflow.last_run_status as 'success' | 'failed' | 'pending' | undefined,
    version: dbWorkflow.version,
    isTemplate: dbWorkflow.is_template,
    folderId: dbWorkflow.folder_id || undefined
  };
}

export function mapWorkflowToDatabaseWorkflow(workflow: Workflow): Omit<WorkflowDatabaseTypes['workflows'], 'id' | 'created_at' | 'updated_at'> {
  return {
    name: workflow.name,
    description: workflow.description || null,
    definition: workflow.definition as unknown as Json,
    status: workflow.status,
    trigger_type: workflow.triggerType,
    trigger_config: workflow.triggerConfig as Json || null,
    created_by: workflow.createdBy,
    last_run_at: workflow.lastRunAt || null,
    last_run_status: workflow.lastRunStatus || null,
    version: workflow.version,
    is_template: workflow.isTemplate,
    folder_id: workflow.folderId || null
  };
}

export function mapDatabaseExecutionToWorkflowExecution(dbExecution: WorkflowDatabaseTypes['workflow_executions']): WorkflowExecution {
  return {
    id: dbExecution.id,
    workflowId: dbExecution.workflow_id,
    status: dbExecution.status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
    startedAt: dbExecution.started_at,
    completedAt: dbExecution.completed_at || undefined,
    initiatedBy: dbExecution.initiated_by || undefined,
    nodeStates: dbExecution.node_states as Record<string, any>,
    inputs: dbExecution.inputs as Record<string, any> | undefined,
    outputs: dbExecution.outputs as Record<string, any> | undefined,
    error: dbExecution.error || undefined,
    logs: dbExecution.logs as any[] || undefined
  };
}

export function mapWorkflowExecutionToDatabaseExecution(execution: WorkflowExecution): Omit<WorkflowDatabaseTypes['workflow_executions'], 'id' | 'started_at'> {
  return {
    workflow_id: execution.workflowId,
    status: execution.status,
    completed_at: execution.completedAt || null,
    initiated_by: execution.initiatedBy || null,
    node_states: execution.nodeStates as Json,
    inputs: execution.inputs as Json || null,
    outputs: execution.outputs as Json || null,
    error: execution.error || null,
    logs: execution.logs as unknown as Json[] || null
  };
}

// Define node type definitions
export const NODE_TYPE_DEFINITIONS: Partial<Record<NodeType, NodeTypeDefinition>> = {
  excelInput: {
    type: 'excelInput',
    name: 'Excel Input',
    category: 'input',
    description: 'Load data from an Excel file',
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
  },
  // Additional node type definitions will be added here
};

// Specific node data interfaces
export interface DataInputNodeData extends NodeData {
  type: 'excelInput' | 'csvInput' | 'apiSource' | 'userInput';
  config: {
    fileId?: string | null;
    sheetName?: string;
    hasHeaders?: boolean;
    range?: string;
    url?: string;
    apiKey?: string;
    promptTemplate?: string;
  };
}

export interface DataProcessingNodeData extends NodeData {
  type: 'dataTransform' | 'filter' | 'sort' | 'merge';
  config: {
    formula?: string;
    transformType?: string;
    filterCondition?: string;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
    mergeField?: string;
  };
}

export interface AINodeData extends NodeData {
  type: 'aiAnalysis';
  config: {
    analysisType?: string;
    promptTemplate?: string;
    analysisOptions?: Record<string, any>;
  };
}

export interface OutputNodeData extends NodeData {
  type: 'visualize' | 'export' | 'notification' | 'spreadsheetGenerator';
  config: {
    chartType?: string;
    exportFormat?: string;
    filename?: string;
    notificationType?: string;
    notificationChannel?: string;
    sheets?: Array<{ name: string; data: any[] }>;
  };
}

export interface ControlNodeData extends NodeData {
  type: 'conditionalBranch' | 'loop' | 'delay';
  config: {
    condition?: string;
    loopType?: 'for' | 'while' | 'forEach';
    iterations?: number;
    loopCondition?: string;
    delayDuration?: number;
    delayUnit?: 'seconds' | 'minutes' | 'hours';
  };
}

export interface IntegrationNodeData extends NodeData {
  type: 'apiCall' | 'emailSender' | 'schedule' | 'webhook';
  config: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    recipients?: string[];
    subject?: string;
    emailBody?: string;
    cronExpression?: string;
    timezone?: string;
    endpoint?: string;
  };
}

export interface SpreadsheetGeneratorNodeData extends NodeData {
  type: 'spreadsheetGenerator';
  config: {
    filename?: string;
    sheets?: Array<{ name: string; data: any[] }>;
  };
}
