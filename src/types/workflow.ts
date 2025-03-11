
import { Node, Edge as FlowEdge } from '@xyflow/react';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [property: string]: Json }
  | Json[];

// Node Component Types
export type NodeComponentType =
  | 'dataInput'
  | 'dataProcessing'
  | 'aiNode'
  | 'askAI'
  | 'outputNode'
  | 'integrationNode'
  | 'controlNode'
  | 'utilityNode'
  | 'fileUpload'
  | 'spreadsheetGenerator';

// Reexport Edge type
export type Edge = FlowEdge;

// Node Props Interface
export interface NodeProps {
  id: string;
  data: WorkflowNodeData;
}

// Base Node Data
export interface BaseNodeData {
  label: string;
  type: string;
  config: Record<string, any>;
}

// Node Type Interfaces
export interface AINodeData extends BaseNodeData {
  type: AINodeType;
  config: {
    prompt?: string;
    model?: string;
    provider?: string;
  };
}

export interface DataInputNodeData extends BaseNodeData {
  type: InputNodeType;
  config: {
    fieldType?: string;
    defaultValue?: any;
  };
}

export interface FileUploadNodeData extends BaseNodeData {
  type: 'fileUpload';
  config: {
    fileId?: string;
    fileName?: string;
    uploadStatus?: string;
  };
}

export interface SpreadsheetGeneratorNodeData extends BaseNodeData {
  type: 'spreadsheetGenerator';
  config: {
    template?: string;
    rowCount?: number;
  };
}

export interface ControlNodeData extends BaseNodeData {
  type: ControlNodeType;
  config: {
    condition?: string;
    iterations?: number;
  };
}

export interface IntegrationNodeData extends BaseNodeData {
  type: IntegrationNodeType;
  config: {
    endpoint?: string;
    method?: string;
  };
}

export interface UtilityNodeData extends BaseNodeData {
  type: UtilityNodeType;
  config: {
    operation?: string;
  };
}

export interface OutputNodeData extends BaseNodeData {
  type: OutputNodeType;
  config: {
    format?: string;
  };
}

// Node Types
export type NodeType =
  | InputNodeType
  | ProcessingNodeType
  | AINodeType
  | OutputNodeType
  | IntegrationNodeType
  | ControlNodeType
  | UtilityNodeType
  | 'fileUpload'
  | 'spreadsheetGenerator';

// Workflow Related Interfaces
export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: Edge[];
}

export interface WorkflowExecution {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
}

export interface NodeExecutionContext {
  executionId: string;
  nodeId: string;
  workflowId: string;
}

// AI Request Interface
export interface AIRequestData {
  id: string;
  workflow_id: string;
  node_id: string;
  execution_id: string;
  ai_provider: 'openai' | 'anthropic' | 'deepseek';
  user_query: string;
  status: string;
  created_at: string;
  model_name: string;
  system_message?: string;
}

// Component Props Interfaces
export interface NodeConfigPanelProps {
  node: WorkflowNode;
  onConfigChange: (config: any) => void;
}

export interface NodeLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode?: (type: string, category: string, label: string) => void;
  nodeCategories?: Array<{
    id: string;
    name: string;
    items: Array<{
      type: string;
      label: string;
      description?: string;
    }>;
  }>;
}

// Workflow Node Interface
export interface WorkflowNodeData extends BaseNodeData {
  onConfigChange?: (config: any) => void;
  onShowLogs?: (nodeId: string) => void;
}

export interface WorkflowNode extends Node<WorkflowNodeData> {
  type: NodeComponentType;
}

// Workflow Context Interface
export interface WorkflowContextType {
  workflowId?: string;
  isTemporaryId: (id: string) => boolean;
  convertToDbWorkflowId: (id: string) => string;
  formatWorkflowId: (id: string, temporary: boolean) => string;
  migrateTemporaryWorkflow: (oldId: string, newId: string) => Promise<boolean>;
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string) => Promise<boolean>;
}

// Re-export all previously defined types
export type {
  InputNodeType,
  ProcessingNodeType,
  AINodeType,
  OutputNodeType,
  IntegrationNodeType,
  ControlNodeType,
  UtilityNodeType
} from './workflow';

