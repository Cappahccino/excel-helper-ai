
// Import types and utilities
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { 
  Workflow, 
  WorkflowExecution, 
  WorkflowNode, 
  Edge,
  mapDatabaseExecutionToWorkflowExecution
} from '@/types/workflow';

// Import node handlers
import { handleExcelInput } from './workflow/handlers/excelInput';
import { 
  handleDataTransform, 
  handleDataCleaning,
  handleFilterNode
} from './workflow/handlers/dataTransform';

// Since these handlers don't exist yet, we'll create placeholders
// or comment them out until they're implemented
// Commented out imports that don't exist yet
// import { handleFormulaNode } from './workflow/handlers/dataTransform';
// import { handleApiRequest } from './workflow/handlers/apiIntegration';
// import { handleSpreadsheetGeneration } from './workflow/handlers/spreadsheetGenerator';

// Create placeholders for missing handlers
const handleFormulaNode = async (inputs: any, config: any) => {
  console.log('Formula node handler not implemented yet');
  return { data: inputs.data };
};

const handleApiRequest = async (inputs: any, config: any) => {
  console.log('API request handler not implemented yet');
  return { data: [] };
};

const handleSpreadsheetGeneration = async (inputs: any, config: any) => {
  console.log('Spreadsheet generator handler not implemented yet');
  return { fileId: null };
};

// Node handlers registry
const nodeHandlers: Record<string, (inputs: any, config: any) => Promise<any>> = {
  excelInput: handleExcelInput,
  dataTransform: handleDataTransform,
  dataCleaning: handleDataCleaning,
  formulaNode: handleFormulaNode,
  filterNode: handleFilterNode,
  apiSource: handleApiRequest,
  spreadsheetGenerator: handleSpreadsheetGeneration,
};

// Helper functions

// Create a new workflow
export async function createWorkflow(
  name: string,
  description: string,
  nodes: WorkflowNode[] = [],
  edges: Edge[] = [],
  isTemplate: boolean = false,
  tags: string[] = []
): Promise<string | null> {
  try {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    if (!userId) {
      console.error('User not authenticated');
      return null;
    }
    
    const workflowId = uuidv4();
    
    const { error } = await supabase.from('workflows').insert({
      id: workflowId,
      name,
      description,
      definition: JSON.stringify({ nodes, edges }),
      is_template: isTemplate,
      tags,
      user_id: userId,
      created_by: userId,  // Add this field to satisfy the constraint
    });
    
    if (error) throw error;
    
    return workflowId;
  } catch (error) {
    console.error('Error creating workflow:', error);
    return null;
  }
}

// Get a workflow by ID
export async function getWorkflow(id: string): Promise<Workflow | null> {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    if (!data) return null;
    
    // Parse the workflow definition
    let definition;
    try {
      definition = typeof data.definition === 'string'
        ? JSON.parse(data.definition)
        : data.definition;
    } catch (e) {
      console.error('Error parsing workflow definition:', e);
      definition = { nodes: [], edges: [] };
    }
    
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      definition: {
        nodes: definition.nodes || [],
        edges: definition.edges || []
      },
      created_at: data.created_at,
      updated_at: data.updated_at,
      user_id: data.user_id,
      is_template: data.is_template,
      tags: data.tags
    };
  } catch (error) {
    console.error('Error getting workflow:', error);
    return null;
  }
}

// Get workflow executions
export async function getWorkflowExecutions(workflowId: string): Promise<WorkflowExecution[]> {
  try {
    const { data, error } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!data) return [];
    
    // Use type assertion to fix deep typization issue
    const executions = data.map(execution => mapDatabaseExecutionToWorkflowExecution(execution));
    
    return executions as WorkflowExecution[];
  } catch (error) {
    console.error('Error getting workflow executions:', error);
    return [];
  }
}

// Execute a workflow
export async function executeWorkflow(workflowId: string, inputs: Record<string, any> = {}): Promise<string | null> {
  try {
    const workflow = await getWorkflow(workflowId);
    
    if (!workflow) {
      console.error('Workflow not found');
      return null;
    }
    
    const executionId = uuidv4();
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    // Create execution record
    const { error } = await supabase.from('workflow_executions').insert({
      id: executionId,
      workflow_id: workflowId,
      status: 'pending',
      inputs,
      initiated_by: userId,
      started_at: new Date().toISOString()
    });
    
    if (error) throw error;
    
    // Trigger execution (this would be handled by a background process in a real app)
    // For now, we're just returning the execution ID
    
    return executionId;
  } catch (error) {
    console.error('Error executing workflow:', error);
    return null;
  }
}
