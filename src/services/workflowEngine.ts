
import { supabase } from "@/integrations/supabase/client";
import {
  WorkflowDefinition,
  Workflow,
  WorkflowExecution,
  NodeBase,
  NodeHandler,
  NodeInputs,
  NodeOutputs,
  NodeExecutionContext,
  mapDatabaseWorkflowToWorkflow,
  mapWorkflowToDatabaseWorkflow,
  mapDatabaseExecutionToWorkflowExecution,
  mapWorkflowExecutionToDatabaseExecution
} from "@/types/workflow";
import { Json } from "@/types/supabase";

// Handler registry
const nodeHandlers: Record<string, NodeHandler> = {};

// Register a node handler
export function registerNodeHandler(type: string, handler: NodeHandler) {
  nodeHandlers[type] = handler;
}

// Get a workflow by ID
export async function getWorkflow(id: string): Promise<Workflow | null> {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('Error getting workflow:', error);
    return null;
  }

  return mapDatabaseWorkflowToWorkflow(data);
}

// Create a new workflow
export async function createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow | null> {
  const dbWorkflow = mapWorkflowToDatabaseWorkflow(workflow as Workflow);
  
  const { data, error } = await supabase
    .from('workflows')
    .insert(dbWorkflow)
    .select()
    .single();

  if (error || !data) {
    console.error('Error creating workflow:', error);
    return null;
  }

  return mapDatabaseWorkflowToWorkflow(data);
}

// Update a workflow
export async function updateWorkflow(id: string, workflow: Partial<Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Workflow | null> {
  const { data, error } = await supabase
    .from('workflows')
    .update({
      name: workflow.name,
      description: workflow.description || null,
      definition: workflow.definition as unknown as Json || undefined,
      status: workflow.status,
      trigger_type: workflow.triggerType,
      trigger_config: workflow.triggerConfig as Json || null,
      last_run_at: workflow.lastRunAt || null,
      last_run_status: workflow.lastRunStatus || null,
      version: workflow.version,
      is_template: workflow.isTemplate,
      folder_id: workflow.folderId || null
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    console.error('Error updating workflow:', error);
    return null;
  }

  return mapDatabaseWorkflowToWorkflow(data);
}

// Execute a workflow
export async function executeWorkflow(workflowId: string, inputs?: Record<string, any>): Promise<WorkflowExecution | null> {
  // Get the workflow
  const workflow = await getWorkflow(workflowId);
  if (!workflow) return null;

  // Create execution record
  const { data: executionData, error: executionError } = await supabase
    .from('workflow_executions')
    .insert({
      workflow_id: workflowId,
      status: 'running',
      inputs: inputs as Json || null,
      node_states: {} as Json,
      initiated_by: (await supabase.auth.getUser()).data.user?.id || null
    })
    .select()
    .single();

  if (executionError || !executionData) {
    console.error('Error creating execution record:', executionError);
    return null;
  }

  const execution = mapDatabaseExecutionToWorkflowExecution(executionData);

  // Update workflow status
  await supabase
    .from('workflows')
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: 'pending'
    })
    .eq('id', workflowId);

  // Execute in background
  executeWorkflowGraph(workflow, execution).catch(console.error);

  return execution;
}

// Get execution by ID
export async function getExecution(id: string): Promise<WorkflowExecution | null> {
  const { data, error } = await supabase
    .from('workflow_executions')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('Error getting execution:', error);
    return null;
  }

  return mapDatabaseExecutionToWorkflowExecution(data);
}

// Update execution status
export async function updateExecution(execution: WorkflowExecution): Promise<void> {
  const dbExecution = mapWorkflowExecutionToDatabaseExecution(execution);
  
  const { error } = await supabase
    .from('workflow_executions')
    .update(dbExecution)
    .eq('id', execution.id);

  if (error) {
    console.error('Error updating execution:', error);
  }
}

// Execute the workflow graph
async function executeWorkflowGraph(workflow: Workflow, execution: WorkflowExecution): Promise<void> {
  try {
    const { nodes, edges } = workflow.definition;
    const nodeOutputs: Record<string, NodeOutputs> = {};
    const executionContext: NodeExecutionContext = {
      workflowId: workflow.id,
      executionId: execution.id,
      userId: execution.initiatedBy,
      log: (level, message, details) => {
        if (!execution.logs) execution.logs = [];
        execution.logs.push({
          timestamp: new Date().toISOString(),
          level,
          message,
          details
        });
      }
    };

    // Find starting nodes (no incoming edges)
    const startingNodeIds = nodes.filter(node => 
      !edges.some(edge => edge.target === node.id)
    ).map(node => node.id);

    // Execute the graph
    const executionPromises = startingNodeIds.map(nodeId => 
      executeNode(nodeId, nodes, edges, nodeOutputs, executionContext)
    );

    await Promise.all(executionPromises);

    // Update execution status to completed
    execution.status = 'completed';
    execution.completedAt = new Date().toISOString();
    execution.outputs = Object.entries(nodeOutputs).reduce((acc, [nodeId, outputs]) => {
      // Only include outputs from terminal nodes (no outgoing edges)
      if (!edges.some(edge => edge.source === nodeId)) {
        acc[nodeId] = outputs;
      }
      return acc;
    }, {} as Record<string, any>);

    await updateExecution(execution);

    // Update workflow status
    await supabase
      .from('workflows')
      .update({ last_run_status: 'success' })
      .eq('id', workflow.id);

  } catch (error) {
    console.error('Workflow execution error:', error);
    execution.status = 'failed';
    execution.completedAt = new Date().toISOString();
    execution.error = error instanceof Error ? error.message : String(error);
    
    await updateExecution(execution);

    // Update workflow status
    await supabase
      .from('workflows')
      .update({ last_run_status: 'failed' })
      .eq('id', workflow.id);
  }
}

// Execute a single node
async function executeNode(
  nodeId: string,
  nodes: NodeBase[],
  edges: any[],
  nodeOutputs: Record<string, NodeOutputs>,
  context: NodeExecutionContext
): Promise<NodeOutputs> {
  // Check if already executed
  if (nodeOutputs[nodeId]) {
    return nodeOutputs[nodeId];
  }

  const node = nodes.find(n => n.id === nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} not found`);
  }

  // Get incoming edges
  const incomingEdges = edges.filter(edge => edge.target === nodeId);

  // If no incoming edges, execute with empty inputs
  if (incomingEdges.length === 0) {
    const handler = nodeHandlers[node.type];
    if (!handler) {
      throw new Error(`No handler registered for node type: ${node.type}`);
    }

    const outputs = await handler(node, {}, context);
    nodeOutputs[nodeId] = outputs;
    return outputs;
  }

  // Execute all predecessor nodes and collect inputs
  const inputs: NodeInputs = {};
  await Promise.all(incomingEdges.map(async edge => {
    const sourceNodeId = edge.source;
    const sourceOutputs = await executeNode(
      sourceNodeId,
      nodes,
      edges,
      nodeOutputs,
      context
    );

    // Map outputs to inputs based on connection
    if (edge.sourceHandle && edge.targetHandle) {
      inputs[edge.targetHandle] = sourceOutputs[edge.sourceHandle];
    } else {
      // Default behavior: pass all outputs as inputs
      Object.assign(inputs, sourceOutputs);
    }
  }));

  // Execute the node
  const handler = nodeHandlers[node.type];
  if (!handler) {
    throw new Error(`No handler registered for node type: ${node.type}`);
  }

  try {
    const outputs = await handler(node, inputs, context);
    nodeOutputs[nodeId] = outputs;

    // Propagate execution to downstream nodes
    const outgoingEdges = edges.filter(edge => edge.source === nodeId);
    await Promise.all(outgoingEdges.map(edge => 
      executeNode(edge.target, nodes, edges, nodeOutputs, context)
    ));

    return outputs;
  } catch (error) {
    context.log('error', `Error executing node ${nodeId} (${node.type}): ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
