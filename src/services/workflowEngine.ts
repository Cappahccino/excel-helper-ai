import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import { executeDataTransform } from './workflow/handlers/dataTransform';
import { executeAIAnalysis } from './workflow/handlers/aiAnalysis';
import { executeApiIntegration } from './workflow/handlers/apiIntegration';
import { executeExcelInput } from './workflow/handlers/excelInput';
import { executeSpreadsheetGenerator } from './workflow/handlers/spreadsheetGenerator';
import { executeDataProcessing } from './workflow/handlers/dataProcessing';

interface NodeExecutionContext {
  nodeId: string;
  executionId: string;
  workflowId: string;
  inputs: Record<string, any>;
  config: Record<string, any>;
  type: string;
}

// Execute a specific node in the workflow
export async function executeWorkflowNode(context: NodeExecutionContext) {
  console.log(`Executing node ${context.nodeId} of type ${context.type}`);
  
  try {
    switch (context.type) {
      case 'dataTransform':
        return await executeDataTransform(context.nodeId, context.executionId, context.config, context.inputs);
      case 'aiAnalyze':
        return await executeAIAnalysis(context.nodeId, context.executionId, context.config, context.inputs);
      case 'apiIntegration':
        return await executeApiIntegration(context.nodeId, context.executionId, context.config, context.inputs);
      case 'excelInput':
        return await executeExcelInput(context.nodeId, context.executionId, context.config, context.inputs);
      case 'spreadsheetGenerator':
        return await executeSpreadsheetGenerator(context.nodeId, context.executionId, context.config, context.inputs);
      
      // Handle our new data processing node types
      case 'filtering':
      case 'sorting':
      case 'aggregation':
      case 'formulaCalculation':
      case 'textTransformation':
      case 'dataTypeConversion':
      case 'dateFormatting':
      case 'pivotTable':
      case 'joinMerge':
      case 'deduplication':
        return await executeDataProcessing(
          context.nodeId, 
          context.workflowId, 
          context.executionId, 
          { operation: context.type, ...context.config },
          context.inputs
        );
      
      default:
        console.warn(`Unknown node type: ${context.type}`);
        return { error: `Node type ${context.type} is not supported` };
    }
  } catch (error) {
    console.error(`Error executing node ${context.nodeId}:`, error);
    return { error: error.message || 'Unknown error executing node' };
  }
}

// Start the workflow execution
export async function startWorkflowExecution(workflowId: string, inputs: Record<string, any> = {}) {
  console.log(`Starting workflow execution for workflow ID: ${workflowId}`);
  
  try {
    // Fetch the workflow definition from Supabase
    const { data: workflowData, error: workflowError } = await supabase
      .from('workflows')
      .select('definition')
      .eq('id', workflowId)
      .single();
    
    if (workflowError) {
      console.error('Error fetching workflow:', workflowError);
      return { error: 'Failed to fetch workflow definition' };
    }
    
    if (!workflowData) {
      console.error('Workflow not found');
      return { error: 'Workflow not found' };
    }
    
    // Parse the workflow definition
    const definition = JSON.parse(workflowData.definition);
    const nodes = definition.nodes;
    const edges = definition.edges;
    
    // Create a new execution record in Supabase
    const executionId = uuidv4();
    
    const { error: executionError } = await supabase
      .from('workflow_executions')
      .insert({
        id: executionId,
        workflow_id: workflowId,
        status: 'pending',
        inputs: inputs,
        node_states: {},
        started_at: new Date().toISOString()
      });
    
    if (executionError) {
      console.error('Error creating execution record:', executionError);
      return { error: 'Failed to create execution record' };
    }
    
    // Initialize node states
    const nodeStates = {};
    nodes.forEach(node => {
      nodeStates[node.id] = { status: 'pending', started_at: null, completed_at: null, error: null };
    });
    
    // Update the execution record with initial node states
    await supabase
      .from('workflow_executions')
      .update({ node_states: nodeStates })
      .eq('id', executionId);
    
    // Start processing the workflow
    processWorkflow(workflowId, executionId, nodes, edges, inputs);
    
    return { executionId: executionId };
    
  } catch (error) {
    console.error('Error starting workflow execution:', error);
    return { error: error.message || 'Unknown error starting workflow' };
  }
}

// Process the workflow
async function processWorkflow(
  workflowId: string,
  executionId: string,
  nodes: any[],
  edges: any[],
  inputs: Record<string, any>
) {
  console.log(`Processing workflow ${workflowId}, execution ID: ${executionId}`);
  
  try {
    // Find the starting node (the node with no incoming edges)
    const startNode = nodes.find(node => !edges.find(edge => edge.target === node.id));
    
    if (!startNode) {
      console.error('No start node found');
      await updateWorkflowExecutionStatus(executionId, 'failed', 'No start node found');
      return;
    }
    
    // Execute the workflow from the starting node
    await executeNodeAndFollowEdges(startNode, executionId, workflowId, nodes, edges, inputs);
    
  } catch (error) {
    console.error('Error processing workflow:', error);
    await updateWorkflowExecutionStatus(executionId, 'failed', error.message || 'Unknown error processing workflow');
  }
}

// Execute a node and follow its outgoing edges
async function executeNodeAndFollowEdges(
  node: any,
  executionId: string,
  workflowId: string,
  nodes: any[],
  edges: any[],
  inputs: Record<string, any>
) {
  console.log(`Executing node ${node.id}, execution ID: ${executionId}`);
  
  try {
    // Update node status to running
    await updateWorkflowNodeStatus(executionId, node.id, 'running');
    
    // Prepare the node execution context
    const context = {
      nodeId: node.id,
      executionId: executionId,
      workflowId: workflowId,
      inputs: inputs,
      config: node.data.config,
      type: node.data.type
    };
    
    // Execute the node
    const result = await executeWorkflowNode(context);
    
    if (result.error) {
      console.error(`Error executing node ${node.id}:`, result.error);
      await updateWorkflowNodeStatus(executionId, node.id, 'failed', result.error);
      await updateWorkflowExecutionStatus(executionId, 'failed', result.error);
      return;
    }
    
    // Update node status to completed
    await updateWorkflowNodeStatus(executionId, node.id, 'completed', null, result);
    
    // Find outgoing edges from the current node
    const outgoingEdges = edges.filter(edge => edge.source === node.id);
    
    // If there are no outgoing edges, the workflow is complete
    if (outgoingEdges.length === 0) {
      console.log('Workflow execution completed');
      await updateWorkflowExecutionStatus(executionId, 'completed');
      return;
    }
    
    // Execute the next nodes based on the outgoing edges
    for (const edge of outgoingEdges) {
      const nextNode = nodes.find(n => n.id === edge.target);
      
      if (!nextNode) {
        console.error(`Next node not found for edge target: ${edge.target}`);
        continue;
      }
      
      // Prepare inputs for the next node (pass the result from the current node)
      const nextNodeInputs = { ...inputs, data: result.data };
      
      // Execute the next node
      await executeNodeAndFollowEdges(nextNode, executionId, workflowId, nodes, edges, nextNodeInputs);
    }
    
  } catch (error) {
    console.error(`Error executing node ${node.id}:`, error);
    await updateWorkflowNodeStatus(executionId, node.id, 'failed', error.message || 'Unknown error executing node');
    await updateWorkflowExecutionStatus(executionId, 'failed', error.message || 'Unknown error executing node');
  }
}

// Update the status of a workflow execution
async function updateWorkflowExecutionStatus(executionId: string, status: string, error: string | null = null) {
  console.log(`Updating workflow execution status for execution ID: ${executionId} to status: ${status}`);
  
  try {
    const { error: updateError } = await supabase
      .from('workflow_executions')
      .update({ status: status, completed_at: new Date().toISOString(), error: error })
      .eq('id', executionId);
    
    if (updateError) {
      console.error('Error updating workflow execution status:', updateError);
    }
  } catch (error) {
    console.error('Error updating workflow execution status:', error);
  }
}

// Update the status of a node in a workflow execution
async function updateWorkflowNodeStatus(
  executionId: string,
  nodeId: string,
  status: string,
  error: string | null = null,
  result: any = null
) {
  console.log(`Updating node status for node ID: ${nodeId} to status: ${status}`);
  
  try {
    const { data, error: fetchError } = await supabase
      .from('workflow_executions')
      .select('node_states')
      .eq('id', executionId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching workflow execution:', fetchError);
      return;
    }
    
    if (!data) {
      console.error('Workflow execution not found');
      return;
    }
    
    const nodeStates = data.node_states || {};
    nodeStates[nodeId] = {
      ...nodeStates[nodeId],
      status: status,
      started_at: nodeStates[nodeId].started_at || new Date().toISOString(),
      completed_at: new Date().toISOString(),
      error: error,
      output: result
    };
    
    const { error: updateError } = await supabase
      .from('workflow_executions')
      .update({ node_states: nodeStates })
      .eq('id', executionId);
    
    if (updateError) {
      console.error('Error updating workflow execution:', updateError);
    }
  } catch (error) {
    console.error('Error updating workflow execution:', error);
  }
}
