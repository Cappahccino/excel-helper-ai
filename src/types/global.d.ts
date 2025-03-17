
import { SchemaColumn } from '@/hooks/useNodeManagement';

declare global {
  interface Window {
    saveWorkflowTimeout?: number;
    workflowBuilderRefs?: {
      reactFlowWrapper: React.RefObject<HTMLDivElement>;
      reactFlowInstance: any;
    };
    propagateSchemaDirectly: (
      workflowId: string,
      sourceNodeId: string,
      targetNodeId: string,
      sheetName?: string
    ) => Promise<boolean>;
    standardizeSchemaColumns: (columns: any[]) => SchemaColumn[];
    workflowContext?: {
      workflowId?: string;
      queueSchemaPropagation?: (
        sourceNodeId: string, 
        targetNodeId: string, 
        sheetName?: string
      ) => string;
      [key: string]: any;
    };
  }
}
