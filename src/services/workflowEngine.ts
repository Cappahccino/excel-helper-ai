
import { supabase } from '@/integrations/supabase/client';
import { Workflow, WorkflowExecution, WorkflowNode, NodeInputs, NodeOutputs, mapDatabaseWorkflowToWorkflow } from '@/types/workflow';
import { v4 as uuidv4 } from 'uuid';

// Import node handlers
import { handleExcelInput } from './workflow/handlers/excelInput';
import { 
  handleDataTransform, 
  handleDataCleaning,
  handleFormulaNode,
  handleFilterNode
} from './workflow/handlers/dataTransform';
import { 
  handleApiRequest 
} from './workflow/handlers/apiIntegration';
import {
  handleSpreadsheetGeneration
} from './workflow/handlers/spreadsheetGenerator';

// Node handler registry
const nodeHandlers: Record<string, (inputs: NodeInputs, config: Record<string, any>) => Promise<NodeOutputs>> = {
  // Input nodes
  excelInput: handleExcelInput,
  
  // Processing nodes
  dataTransform: handleDataTransform,
  dataCleaning: handleDataCleaning,
  formulaNode: handleFormulaNode,
  filterNode: handleFilterNode,
  
  // API and integration nodes
  apiSource: handleApiRequest,
  
  // Output nodes
  spreadsheetGenerator: handleSpreadsheetGeneration
};

// Create a new workflow
export const createWorkflow = async (name: string, description: string, isTemplate: boolean = false, tags: string[] = []): Promise<string> => {
  try {
    const workflowId = uuidv4();
    
    const workflow = {
      id: workflowId,
      name,
      description,
      definition: JSON.stringify({ nodes: [], edges: [] }),
      is_template: isTemplate,
      tags,
      created_by: (await supabase.auth.getUser()).data.user?.id || 'anonymous'
    };
    
    const { error } = await supabase
      .from('workflows')
      .insert(workflow);
    
    if (error) throw error;
    
    return workflowId;
  } catch (error) {
    console.error('Error creating workflow:', error);
    throw error;
  }
};

// Get a workflow by ID
export const getWorkflow = async (id: string): Promise<Workflow | null> => {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    return data ? mapDatabaseWorkflowToWorkflow(data) : null;
  } catch (error) {
    console.error('Error getting workflow:', error);
    throw error;
  }
};

// Execute a node in the workflow
export const executeNode = async (nodeId: string, inputs: NodeInputs, workflowExecution: WorkflowExecution): Promise<NodeOutputs> => {
  try {
    // Get the workflow
    const workflow = await getWorkflow(workflowExecution.workflow_id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowExecution.workflow_id}`);
    }
    
    // Find the node
    const node = workflow.definition.nodes.find(n => n.id === nodeId);
    if (!node) {
      throw new Error(`Node not found in workflow: ${nodeId}`);
    }
    
    const nodeType = node.data.type;
    const handler = nodeHandlers[nodeType];
    
    if (!handler) {
      throw new Error(`No handler registered for node type: ${nodeType}`);
    }
    
    console.log(`Executing node ${nodeId} of type ${nodeType}`);
    
    // Execute the node
    return await handler(inputs, node.data.config);
  } catch (error) {
    console.error(`Error executing node ${nodeId}:`, error);
    throw error;
  }
};

// Start a workflow execution
export const startWorkflowExecution = async (workflowId: string, initialInputs: Record<string, any> = {}): Promise<string> => {
  try {
    const executionId = uuidv4();
    
    const execution = {
      id: executionId,
      workflow_id: workflowId,
      status: 'pending',
      inputs: initialInputs,
      started_at: new Date().toISOString(),
      initiated_by: (await supabase.auth.getUser()).data.user?.id || 'anonymous'
    };
    
    const { error } = await supabase
      .from('workflow_executions')
      .insert(execution);
    
    if (error) throw error;
    
    return executionId;
  } catch (error) {
    console.error('Error starting workflow execution:', error);
    throw error;
  }
};

// Update a workflow execution status
export const updateWorkflowExecutionStatus = async (executionId: string, status: string, outputs?: Record<string, any>, error?: string): Promise<void> => {
  try {
    const updates: Record<string, any> = { status };
    
    if (outputs) {
      updates.outputs = outputs;
    }
    
    if (error) {
      updates.error = error;
    }
    
    if (status === 'completed' || status === 'failed') {
      updates.completed_at = new Date().toISOString();
    }
    
    const { error: dbError } = await supabase
      .from('workflow_executions')
      .update(updates)
      .eq('id', executionId);
    
    if (dbError) throw dbError;
  } catch (error) {
    console.error('Error updating workflow execution status:', error);
    throw error;
  }
};

// Get all workflows for the current user
export const getUserWorkflows = async (): Promise<Workflow[]> => {
  try {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(mapDatabaseWorkflowToWorkflow);
  } catch (error) {
    console.error('Error getting user workflows:', error);
    throw error;
  }
};

// Get workflow execution history
export const getWorkflowExecutions = async (workflowId: string): Promise<WorkflowExecution[]> => {
  try {
    const { data, error } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('started_at', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error getting workflow executions:', error);
    throw error;
  }
};
