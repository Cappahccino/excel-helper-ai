import { supabase } from '@/integrations/supabase/client';
import { WorkflowNode, WorkflowExecution, Edge, NodeType } from '@/types/workflow';

export class WorkflowEngine {
  workflowId: string;
  nodes: WorkflowNode[];
  edges: Edge[];
  
  constructor(workflowId: string, nodes: WorkflowNode[], edges: Edge[]) {
    this.workflowId = workflowId;
    this.nodes = nodes;
    this.edges = edges;
  }
  
  async execute(initialInputs: Record<string, any> = {}): Promise<string> {
    try {
      console.log('Starting workflow execution');
      
      // Create execution record
      const { data, error } = await supabase
        .from('workflow_executions')
        .insert({
          workflow_id: this.workflowId,
          status: 'pending'
        })
        .select('id')
        .single();
      
      if (error) {
        console.error('Error creating workflow execution:', error);
        throw error;
      }
      
      const executionId = data.id;
      console.log('Created execution with ID:', executionId);
      
      // Start execution in the background
      const execution: WorkflowExecution = {
        id: executionId,
        workflow_id: this.workflowId,
        status: 'running',
        startedAt: new Date().toISOString(),
        // Use our updated interface that now includes inputs
        inputs: initialInputs
      };
      
      // Update execution status
      await this.updateExecutionStatus(execution);
      
      // Call Edge Function to execute the workflow
      const { data: executeData, error: executeError } = await supabase.functions
        .invoke('executeWorkflowStep', {
          body: {
            execution_id: executionId,
            workflow_id: this.workflowId,
            // Use our updated interface that now includes inputs
            inputs: initialInputs
          }
        });
      
      if (executeError) {
        console.error('Error starting workflow execution:', executeError);
        throw executeError;
      }
      
      return executionId;
    } catch (error) {
      console.error('Error in workflow execution:', error);
      throw error;
    }
  }
  
  async updateExecutionStatus(execution: WorkflowExecution): Promise<void> {
    try {
      const { error } = await supabase
        .from('workflow_executions')
        .update({
          status: execution.status,
          ...(execution.startedAt && { started_at: execution.startedAt }),
          ...(execution.completedAt && { completed_at: execution.completedAt }),
        })
        .eq('id', execution.id);
      
      if (error) {
        console.error('Error updating execution status:', error);
      }
    } catch (error) {
      console.error('Error in updateExecutionStatus:', error);
    }
  }
  
  getNodesByType(type: string): WorkflowNode[] {
    const matchNodes = this.nodes.filter(node => {
      // Match the exact type
      if (node.data.type === type) return true;
      
      // Or match a category of types
      switch (type) {
        case 'input':
          return ['dataInput', 'fileInput', 'apiInput', 'excelInput', 
                 'csvInput', 'apiSource', 'userInput', 'fileUpload'].includes(node.data.type);
                 
        case 'processing':
          return ['dataProcessing', 'sorting', 'filtering', 'transformation',
                 'dataTransform', 'dataCleaning', 'formulaNode', 'filterNode'].includes(node.data.type);
                 
        case 'ai':
          return ['aiNode', 'askAI', 'aiCompletion', 'aiClassification',
                 'aiAnalyze', 'aiClassify', 'aiSummarize'].includes(node.data.type);
                 
        case 'output':
          return ['outputNode', 'fileOutput', 'apiOutput', 'visualizationOutput',
                 'excelOutput', 'dashboardOutput', 'emailNotify'].includes(node.data.type);
                 
        case 'integration':
          return ['integrationNode', 'apiConnector', 'databaseConnector',
                 'xeroConnect', 'salesforceConnect', 'googleSheetsConnect'].includes(node.data.type);
                 
        case 'control':
          return ['controlNode', 'conditionalNode', 'loopNode',
                 'conditionalBranch', 'mergeNode'].includes(node.data.type);
                 
        case 'utility':
          return ['utilityNode', 'formatterNode', 'validatorNode',
                 'logToConsole', 'executionTimestamp', 'sessionManagement', 'variableStorage',
                 'aiStepRecommendation', 'workflowVersionControl', 'performanceMetrics'].includes(node.data.type);
                 
        default:
          return false;
      }
    });
    
    return matchNodes;
  }
  
  async runNode(node: WorkflowNode, executionId: string, inputs: Record<string, any>): Promise<any> {
    console.log(`Executing node ${node.id} of type ${node.data.type}`);
    
    try {
      // Simulate node execution (replace with actual logic)
      const result = await this.simulateNodeExecution(node, inputs);
      
      // Log the result
      console.log(`Node ${node.id} completed with result:`, result);
      
      return result;
    } catch (error) {
      console.error(`Error executing node ${node.id}:`, error);
      throw error;
    }
  }
  
  async simulateNodeExecution(node: WorkflowNode, inputs: Record<string, any>): Promise<any> {
    return new Promise(resolve => {
      setTimeout(() => {
        const result = {
          nodeId: node.id,
          type: node.data.type,
          inputs: inputs,
          output: `Simulated output from ${node.id}`
        };
        resolve(result);
      }, 1000); // Simulate 1 second execution time
    });
  }
}
