
interface Window {
  saveWorkflowTimeout?: number;
  propagateSchemaDirectly?: (workflowId: string, sourceNodeId: string, targetNodeId: string, sheetName?: string) => Promise<boolean>;
  workflowContext?: {
    workflowId?: string;
    queueSchemaPropagation?: (sourceNodeId: string, targetNodeId: string, sheetName?: string) => string;
  };
}
