import { Node, Edge } from '@xyflow/react';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [property: string]: Json }
  | Json[];

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

export type InputNodeType =
  | 'textInput'
  | 'numberInput'
  | 'dateInput'
  | 'booleanInput'
  | 'selectInput';

export type ProcessingNodeType =
  | 'filtering'
  | 'sorting'
  | 'aggregation'
  | 'formulaCalculation'
  | 'textTransformation'
  | 'dataTypeConversion'
  | 'dateFormatting'
  | 'pivotTable'
  | 'joinMerge'
  | 'deduplication';

export type AINodeType =
  | 'textGenerator'
  | 'imageGenerator'
  | 'audioGenerator';

export type OutputNodeType =
  | 'textOutput'
  | 'numberOutput'
  | 'dateOutput'
  | 'booleanOutput';

export type IntegrationNodeType =
  | 'emailSender'
  | 'smsSender'
  | 'webhookSender';

export type ControlNodeType =
  | 'ifThenElse'
  | 'forLoop'
  | 'whileLoop';

export type UtilityNodeType =
  | 'dataConverter'
  | 'dataValidator'
  | 'dataFormatter';

export interface WorkflowNodeData {
  label: string;
  type: InputNodeType | ProcessingNodeType | AINodeType | OutputNodeType | IntegrationNodeType | ControlNodeType | UtilityNodeType | 'fileUpload' | 'spreadsheetGenerator';
  config: any;
  [key: string]: any;
}

export interface WorkflowNode extends Node<WorkflowNodeData> {
  type: NodeComponentType;
}

export interface WorkflowContextType {
  isTemporaryId: (id: string) => boolean;
  convertToDbWorkflowId: (id: string) => string;
  formatWorkflowId: (id: string, isTemporary: boolean) => string;

  /**
   * Propagate file schema from source node to target node
   */
  propagateFileSchema: (sourceNodeId: string, targetNodeId: string) => Promise<boolean>;
}
