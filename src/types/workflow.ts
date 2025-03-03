
import { Node as ReactFlowNode, Edge as ReactFlowEdge, NodeProps as ReactFlowNodeProps } from '@xyflow/react';

// Define our own Json type since we can't import it from supabase
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// Expanded Node Types
export type InputNodeType = 
  | 'dataInput' | 'fileUpload' | 'databaseQuery' | 'manualEntry'
  | 'apiFetch' | 'webhookListener' | 'ftpImport' | 'emailAttachment'
  | 'formSubmission' | 'scheduledFetch' | 'spreadsheetImport' | 'crmDataPull'
  | 'erpDataFetch' | 'spreadsheetGenerator'
  | 'excelInput' | 'csvInput' | 'apiSource' | 'userInput';

export type ProcessingNodeType = 
  | 'dataProcessing' | 'columnMapping' | 'filtering' | 'sorting'
  | 'aggregation' | 'formulaCalculation' | 'currencyConversion' | 'textTransformation'
  | 'dataTypeConversion' | 'deduplication' | 'joinMerge' | 'pivotTable'
  | 'conditionalLogic' | 'dateFormatting' | 'dataMasking' | 'normalization'
  | 'dataTransform' | 'dataCleaning' | 'formulaNode' | 'filterNode';

export type AINodeType = 
  | 'aiNode' | 'aiSummarization' | 'sentimentAnalysis' | 'namedEntityRecognition'
  | 'anomalyDetection' | 'forecasting' | 'documentParsing' | 'clustering'
  | 'mlModelExecution' | 'featureEngineering' | 'aiDataCleaning'
  | 'aiAnalyze' | 'aiClassify' | 'aiSummarize' | 'askAI';

export type OutputNodeType = 
  | 'outputNode' | 'downloadFile' | 'sendEmail' | 'exportToDatabase'
  | 'webhookTrigger' | 'pushNotification' | 'excelExport' | 'pdfGeneration'
  | 'googleSheetsUpdate' | 'ftpUpload' | 'crmUpdate' | 'erpDataSync'
  | 'slackNotification' | 'webhookResponse' | 'apiResponse' | 'smsAlert'
  | 'excelOutput' | 'dashboardOutput' | 'emailNotify';

export type IntegrationNodeType = 
  | 'integrationNode' | 'salesforceConnector' | 'xeroConnector' | 'hubspotConnector'
  | 'googleSheetsConnector' | 'stripeConnector' | 'quickbooksConnector' | 'zendeskConnector'
  | 'shopifyConnector' | 's3Connector' | 'zapierConnector' | 'googleDriveConnector'
  | 'customApiConnector' | 'erpConnector' | 'twilioConnector' | 'powerBiConnector'
  | 'xeroConnect' | 'salesforceConnect' | 'googleSheetsConnect';

export type ControlNodeType = 
  | 'controlNode' | 'ifElseCondition' | 'loopForEach' | 'parallelProcessing'
  | 'errorHandling' | 'waitPause' | 'webhookWait' | 'retryMechanism'
  | 'switchCase'
  | 'conditionalBranch' | 'loopNode' | 'mergeNode';

export type UtilityNodeType = 
  | 'utilityNode' | 'logToConsole' | 'executionTimestamp' | 'sessionManagement' | 'variableStorage'
  | 'aiStepRecommendation' | 'workflowVersionControl' | 'performanceMetrics';

// Combined NodeType that includes all possible node types
export type NodeType = 
  | InputNodeType
  | ProcessingNodeType
  | AINodeType
  | OutputNodeType
  | IntegrationNodeType
  | ControlNodeType
  | UtilityNodeType;

// NodeComponentType represents the visual node component to be used
export type NodeComponentType =
  | 'dataInput'
  | 'dataProcessing'
  | 'aiNode'
  | 'askAI'
  | 'outputNode'
  | 'integrationNode'
  | 'controlNode'
  | 'spreadsheetGenerator'
  | 'utilityNode'
  | 'fileUpload';

// Base node data types
export interface BaseNodeData {
  label: string;
  type: NodeType;
  config: Record<string, any>;
  [key: string]: any;
}

// Node data types
export interface DataInputNodeData extends BaseNodeData {
  type: InputNodeType;
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
  type: ProcessingNodeType;
  config: {
    operations?: any[];
    rules?: any[];
    formula?: string;
    conditions?: any[];
    [key: string]: any;
  };
}

export interface AINodeData extends BaseNodeData {
  type: AINodeType;
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
    systemMessage?: string;
    aiProvider?: 'openai' | 'anthropic' | 'deepseek';
    modelName?: string;
    lastResponse?: string;
    lastResponseTime?: string;
    [key: string]: any;
  };
}

export interface OutputNodeData extends BaseNodeData {
  type: OutputNodeType;
  config: {
    filename?: string;
    format?: string;
    visualizations?: any[];
    recipients?: string[];
    [key: string]: any;
  };
}

export interface IntegrationNodeData extends BaseNodeData {
  type: IntegrationNodeType;
  config: {
    operation?: string;
    credentials?: any;
    spreadsheetId?: string;
    [key: string]: any;
  };
}

export interface ControlNodeData extends BaseNodeData {
  type: ControlNodeType;
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

export interface UtilityNodeData extends BaseNodeData {
  type: UtilityNodeType;
  config: {
    logLevel?: string;
    variableKey?: string;
    variableValue?: any;
    performanceThreshold?: number;
    [key: string]: any;
  };
}

export interface FileUploadNodeData extends BaseNodeData {
  type: 'fileUpload';
  config: {
    fileId?: string | null;
    hasHeaders?: boolean;
    delimiter?: string;
    [key: string]: any;
  };
}

// A union of all possible node data types
export type WorkflowNodeData = 
  | DataInputNodeData 
  | DataProcessingNodeData 
  | AINodeData 
  | OutputNodeData 
  | IntegrationNodeData 
  | ControlNodeData 
  | SpreadsheetGeneratorNodeData
  | UtilityNodeData
  | FileUploadNodeData;

// Use a simplified NodeProps type that works with our component structure
export type NodeProps<T extends BaseNodeData = BaseNodeData> = {
  data?: T;
  selected?: boolean;
  id?: string;
};

// Define handlers for node drag events with proper types from ReactFlow
export type NodeDragHandler = (event: React.MouseEvent, node: ReactFlowNode, nodes: ReactFlowNode[]) => void;

// Export Edge type from ReactFlow for use in our application
export type Edge = ReactFlowEdge;

// Add Workflow Node type that extends XyFlow's Node type with our specific data
export interface WorkflowNode extends Omit<ReactFlowNode, 'data'> {
  data: WorkflowNodeData;
}

// Workflow definition types
export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: Edge[];
}

// Node handler interfaces
export interface NodeInputs {
  [key: string]: any;
}

export interface NodeOutputs {
  [key: string]: any;
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

// Node execution types
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

// WorkflowExecution interface update to allow string status for database compatibility
export interface WorkflowExecution {
  id?: string;
  workflow_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | string;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  node_states?: Record<string, any>;
  started_at?: string;
  completed_at?: string;
  error?: string;
  initiated_by?: string;
  logs?: any[];
}

// Define NodeLibraryProps interface for NodeLibrary component
export interface NodeLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode?: (nodeType: string, nodeCategory: string, nodeLabel: string) => void;
  nodeCategories?: Array<{
    id: string;
    name: string;
    items: Array<{
      type: string;
      label: string;
      description?: string;
      icon?: string;
    }>;
  }>;
}

// Define NodeConfigPanelProps interface for NodeConfigPanel component
export interface NodeConfigPanelProps {
  node: WorkflowNode;
  onUpdateConfig: (updatedConfig: any) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
  readOnly?: boolean;
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

// Add a new interface for AI request data
export interface AIRequestData {
  id: string;
  workflow_id: string;
  node_id: string;
  execution_id: string;
  ai_provider: 'openai' | 'anthropic' | 'deepseek';
  user_query: string;
  ai_response?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
  completed_at?: string;
  model_name?: string;
  token_usage?: Record<string, number>;
  metadata?: Record<string, any>;
  system_message?: string;
}

// Type guard function to validate if an object is an AIRequestData
export function isAIRequestData(obj: any): obj is AIRequestData {
  return (
    obj &&
    typeof obj.id === 'string' &&
    typeof obj.workflow_id === 'string' &&
    typeof obj.node_id === 'string' &&
    typeof obj.execution_id === 'string' &&
    (obj.ai_provider === 'openai' || obj.ai_provider === 'anthropic' || obj.ai_provider === 'deepseek') &&
    typeof obj.user_query === 'string'
  );
}
