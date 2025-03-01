// src/services/workflowEngine.ts

import { 
  WorkflowDefinition, 
  WorkflowExecution, 
  NodeDefinition,
  EdgeDefinition 
} from '@/types/workflow';
import { supabase } from "@/integrations/supabase/client";

// NodeHandlers will be imported from individual handler files
import { handleExcelInput } from '@/services/workflow/handlers/excelInput';
import { handleDataTransform } from '@/services/workflow/handlers/dataTransform';
// ... other handlers

// Registry of node handlers
const NODE_HANDLERS: Record<string, (
  node: NodeDefinition, 
  inputs: Record<string, any>, 
  context: ExecutionContext
) => Promise<Record<string, any>>> = {
  excelInput: handleExcelInput,
  dataTransform: handleDataTransform,
  // ... other handlers
};

// Context passed to each node during execution
interface ExecutionContext {
  workflowId: string;
  executionId: string;
  userId: string;
  updateNodeState: (
    nodeId: string, 
    update: Partial<WorkflowExecution['nodeStates'][string]>
  ) => Promise<void>;
  logMessage: (
    message: string,
    level: 'info' | 'warning' | 'error',
    nodeId?: string
  ) => Promise<void>;
  getNodeOutputs: (nodeId: string) => Promise<any>;
}

export class WorkflowEngine {
  /**
   * Starts a new workflow execution
   */
  async startExecution(
    workflowId: string,
    inputs: Record<string, any> = {},
    userId: string
  ): Promise<string> {
    // Retrieve the workflow definition
    const { data: workflow, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();
      
    if (error || !workflow) {
      throw new Error(`Workflow not found: ${error?.message || 'Unknown error'}`);
    }
    
    // Create a new execution record
    const executionId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    const workflowDef: WorkflowDefinition = workflow.definition;
    
    // Initialize all nodes as pending
    const nodeStates: WorkflowExecution['nodeStates'] = {};
    workflowDef.nodes.forEach(node => {
      nodeStates[node.id] = {
        status: 'pending',
      };
    });
    
    // Create execution record
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'running',
      startedAt: now,
      nodeStates,
      inputs,
      outputs: {},
      logs: [
        {
          timestamp: now,
          level: 'info',
          message: `Started workflow execution: ${workflowDef.name}`,
        }
      ]
    };
    
    // Save the initial execution state
    await supabase
      .from('workflow_executions')
      .insert(execution);
      
    // Start the execution process in the background
    this.executeWorkflow(workflowDef, execution, userId)
      .catch(error => this.handleExecutionError(executionId, error));
      
    return executionId;
  }
  
  /**
   * Execute a workflow by traversing the graph and running each node
   */
  private async executeWorkflow(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    userId: string
  ): Promise<void> {
    try {
      // Build dependency graph
      const graph = this.buildDependencyGraph(workflow.nodes, workflow.edges);
      
      // Get starting nodes (with no inputs or only receiving from workflow inputs)
      const startNodes = this.getStartNodes(workflow.nodes, graph);
      
      // Create execution context
      const context: ExecutionContext = {
        workflowId: workflow.id,
        executionId: execution.id,
        userId,
        updateNodeState: async (nodeId, update) => {
          await supabase
            .from('workflow_executions')
            .update({
              nodeStates: {
                ...execution.nodeStates,
                [nodeId]: {
                  ...execution.nodeStates[nodeId],
                  ...update
                }
              }
            })
            .eq('id', execution.id);
            
          // Update our local copy as well
          execution.nodeStates[nodeId] = {
            ...execution.nodeStates[nodeId],
            ...update
          };
        },
        logMessage: async (message, level, nodeId) => {
          const log = {
            timestamp: new Date().toISOString(),
            level,
            message,
            nodeId
          };
          
          execution.logs.push(log);
          
          await supabase
            .from('workflow_executions')
            .update({
              logs: execution.logs
            })
            .eq('id', execution.id);
        },
        getNodeOutputs: async (nodeId) => {
          const nodeState = execution.nodeStates[nodeId];
          return nodeState?.output;
        }
      };
      
      // Execute the graph starting with the start nodes
      await this.executeNodes(startNodes, graph, workflow.nodes, execution.inputs, context);
      
      // Update execution status to completed
      await supabase
        .from('workflow_executions')
        .update({
          status: 'completed',
          completedAt: new Date().toISOString()
        })
        .eq('id', execution.id);
        
      await context.logMessage('Workflow execution completed successfully', 'info');
      
    } catch (error) {
      await this.handleExecutionError(execution.id, error);
    }
  }
  
  /**
   * Handle any errors during workflow execution
   */
  private async handleExecutionError(executionId: string, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await supabase
      .from('workflow_executions')
      .update({
        status: 'failed',
        completedAt: new Date().toISOString(),
        logs: supabase.sql`array_append(logs, jsonb_build_object(
          'timestamp', ${new Date().toISOString()},
          'level', 'error',
          'message', ${errorMessage}
        ))`
      })
      .eq('id', executionId);
  }
  
  /**
   * Build a dependency graph from nodes and edges
   */
  private buildDependencyGraph(
    nodes: NodeDefinition[], 
    edges: EdgeDefinition[]
  ): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    
    // Initialize each node with empty dependencies
    nodes.forEach(node => {
      graph[node.id] = [];
    });
    
    // Add dependencies based on edges
    edges.forEach(edge => {
      const { source, target } = edge;
      graph[target].push(source);
    });
    
    return graph;
  }
  
  /**
   * Get nodes that have no dependencies and can be started immediately
   */
  private getStartNodes(
    nodes: NodeDefinition[],
    graph: Record<string, string[]>
  ): NodeDefinition[] {
    return nodes.filter(node => graph[node.id].length === 0);
  }
  
  /**
   * Execute nodes in topological order
   */
  private async executeNodes(
    nodes: NodeDefinition[],
    graph: Record<string, string[]>,
    allNodes: NodeDefinition[],
    workflowInputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<void> {
    // Process each node
    for (const node of nodes) {
      await this.executeNode(node, graph, allNodes, workflowInputs, context);
    }
  }
  
  /**
   * Execute a single node and its dependents
   */
  private async executeNode(
    node: NodeDefinition,
    graph: Record<string, string[]>,
    allNodes: NodeDefinition[],
    workflowInputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<void> {
    try {
      // Update node state to running
      await context.updateNodeState(node.id, {
        status: 'running',
        startedAt: new Date().toISOString()
      });
      
      await context.logMessage(`Starting node: ${node.data.label}`, 'info', node.id);
      
      // Get handler for this node type
      const handler = NODE_HANDLERS[node.type];
      if (!handler) {
        throw new Error(`No handler found for node type: ${node.type}`);
      }
      
      // Get inputs from dependencies
      const nodeInputs: Record<string, any> = { ...workflowInputs };
      
      // Find incoming edges and get outputs from source nodes
      const incomingEdges = node.data.inputs.map(input => input.id);
      
      const dependencies = graph[node.id];
      for (const depNodeId of dependencies) {
        const depNode = allNodes.find(n => n.id === depNodeId);
        if (!depNode) continue;
        
        // Make sure dependency has been executed
        const depNodeState = await context.getNodeOutputs(depNodeId);
        if (!depNodeState) {
          throw new Error(`Dependency node ${depNodeId} has not been executed yet`);
        }
        
        // Add outputs to this node's inputs
        Object.assign(nodeInputs, depNodeState);
      }
      
      // Execute the node
      const outputs = await handler(node, nodeInputs, context);
      
      // Update node state to completed with outputs
      await context.updateNodeState(node.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        output: outputs
      });
      
      await context.logMessage(`Completed node: ${node.data.label}`, 'info', node.id);
      
      // Find nodes that depend on this one and can now be executed
      const dependentNodeIds = Object.entries(graph)
        .filter(([, deps]) => deps.includes(node.id))
        .map(([nodeId]) => nodeId);
        
      // Check which dependents have all their dependencies satisfied
      const readyNodes: NodeDefinition[] = [];
      
      for (const depId of dependentNodeIds) {
        const dependencies = graph[depId];
        const allDependenciesCompleted = dependencies.every(depNodeId => {
          const depNodeState = context.getNodeOutputs(depNodeId);
          return depNodeState !== undefined;
        });
        
        if (allDependenciesCompleted) {
          const depNode = allNodes.find(n => n.id === depId);
          if (depNode) {
            readyNodes.push(depNode);
          }
        }
      }
      
      // Execute dependent nodes
      if (readyNodes.length > 0) {
        await this.executeNodes(readyNodes, graph, allNodes, workflowInputs, context);
      }
      
    } catch (error) {
      // Update node state to failed
      await context.updateNodeState(node.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      await context.logMessage(
        `Failed to execute node: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
        node.id
      );
      
      // Re-throw to stop workflow execution
      throw error;
    }
  }
}

export const workflowEngine = new WorkflowEngine();
