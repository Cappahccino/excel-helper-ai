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
  | 'spreadsheetGenerator'
  | 'filtering'
  | 'expandable';

// Reexport Edge type
export type Edge = FlowEdge;

// Node Props Interface
export interface NodeProps<T = any> {
  id: string;
  data: T;
  selected?: boolean;
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
    systemMessage?: string;
    modelName?: string;
    lastResponse?: string;
    analysisType?: string;
    analysisOptions?: any;
    classificationOptions?: {
      categories?: string[];
    };
  };
}

export interface DataInputNodeData extends BaseNodeData {
  type: InputNodeType;
  config: {
    fieldType?: string;
    defaultValue?: any;
    fileId?: string;
    fileName?: string;
    hasHeaders?: boolean;
    delimiter?: string;
    endpoint?: string;
    fields?: any[];
  };
}

export interface FileUploadNodeData extends BaseNodeData {
  type: 'fileUpload';
  config: {
    fileId?: string;
    fileName?: string;
    uploadStatus?: string;
  };
  onConfigChange?: (config: any) => void;
}

export interface SpreadsheetGeneratorNodeData extends BaseNodeData {
  type: 'spreadsheetGenerator';
  config: {
    template?: string;
    rowCount?: number;
    filename?: string;
    fileExtension?: string;
    sheets?: Array<{
      name: string;
      columns: Array<{
        name: string;
        type: string;
      }>;
    }>;
  };
}

export interface ControlNodeData extends BaseNodeData {
  type: ControlNodeType;
  config: {
    condition?: string;
    iterations?: number;
    conditions?: any[];
    loopType?: string;
    mergeStrategy?: string;
  };
}

export interface IntegrationNodeData extends BaseNodeData {
  type: IntegrationNodeType;
  config: {
    endpoint?: string;
    method?: string;
    operation?: string;
    credentials?: any;
    spreadsheetId?: string;
  };
}

export interface UtilityNodeData extends BaseNodeData {
  type: UtilityNodeType;
  config: {
    operation?: string;
    logLevel?: string;
    variableKey?: string;
    performanceThreshold?: number;
  };
}

export interface OutputNodeData extends BaseNodeData {
  type: OutputNodeType;
  config: {
    format?: string;
    filename?: string;
    visualizations?: any[];
    recipients?: string[];
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
  | 'spreadsheetGenerator'
  | 'filtering'
  | 'expandable';

// Input Node Types
export type InputNodeType = 'dataInput' | 'fileInput' | 'apiInput' | 'excelInput' | 'csvInput' | 'apiSource' | 'userInput';

// Processing Node Types  
export type ProcessingNodeType = 
  | 'dataProcessing' 
  | 'sorting' 
  | 'filtering' 
  | 'transformation'
  | 'aggregation'
  | 'formulaCalculation'
  | 'textTransformation'
  | 'dataTypeConversion'
  | 'dateFormatting'
  | 'pivotTable'
  | 'joinMerge'
  | 'deduplication'
  | 'dataTransform'
  | 'dataCleaning'
  | 'formulaNode'
  | 'filterNode';

// AI Node Types
export type AINodeType = 
  | 'aiNode' 
  | 'askAI' 
  | 'aiCompletion' 
  | 'aiClassification'
  | 'aiAnalyze'
  | 'aiClassify'
  | 'aiSummarize';

// Output Node Types
export type OutputNodeType = 
  | 'outputNode' 
  | 'fileOutput' 
  | 'apiOutput' 
  | 'visualizationOutput'
  | 'excelOutput'
  | 'dashboardOutput'
  | 'emailNotify';

// Integration Node Types
export type IntegrationNodeType = 
  | 'integrationNode' 
  | 'apiConnector' 
  | 'databaseConnector'
  | 'xeroConnect'
  | 'salesforceConnect'
  | 'googleSheetsConnect';

// Control Node Types
export type ControlNodeType = 
  | 'controlNode' 
  | 'conditionalNode' 
  | 'loopNode'
  | 'conditionalBranch'
  | 'mergeNode';

// Utility Node Types
export type UtilityNodeType = 
  | 'utilityNode' 
  | 'formatterNode' 
  | 'validatorNode'
  | 'logToConsole'
  | 'executionTimestamp'
  | 'sessionManagement'
  | 'variableStorage'
  | 'aiStepRecommendation'
  | 'workflowVersionControl'
  | 'performanceMetrics';

// Workflow Related Interfaces
export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: Edge[];
}

export interface WorkflowExecution {
  id: string;
  workflow_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
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
  onDelete?: () => void;
  onDuplicate?: () => void;
  onClose?: () => void;
  readOnly?: boolean;
}

export interface DataProcessingNodeConfigProps {
  config: Record<string, any>;
  onConfigChange: (updatedConfig: any) => void;
  nodeId: string;
  type: ProcessingNodeType;
}

export interface AskAINodeConfigProps {
  config: Record<string, any>;
  onConfigChange: (updatedConfig: any) => void;
}

export interface SpreadsheetGeneratorNodeConfigProps {
  spreadsheetConfig: SpreadsheetGeneratorNodeData['config'];
  onConfigChange: (updatedConfig: any) => void;
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
export interface WorkflowNodeData extends BaseNodeData, Record<string, unknown> {
  onConfigChange?: (config: any) => void;
  onShowLogs?: (nodeId: string) => void;
}

export interface WorkflowNode extends Omit<Node, 'data' | 'type'> {
  type: NodeComponentType;
  data: WorkflowNodeData;
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

// File Schema Interface
export interface WorkflowFileSchema {
  id: string;
  workflow_id: string;
  node_id: string;
  schema: {
    columns: SchemaColumn[];
  };
  created_at?: string;
  updated_at?: string;
  is_temporary?: boolean;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable?: boolean;
}
