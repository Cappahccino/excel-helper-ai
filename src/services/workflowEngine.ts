import { supabase } from '@/integrations/supabase/client';
import { 
  WorkflowNodeData,
  WorkflowDefinition,
  NodeInputs,
  NodeOutputs,
  NodeHandler,
  Workflow,
  WorkflowExecution,
  mapDatabaseWorkflowToWorkflow,
  mapWorkflowToDatabaseWorkflow,
  mapDatabaseExecutionToWorkflowExecution,
  mapWorkflowExecutionToDatabaseExecution,
  WorkflowNode,
  NodeExecutionContext
} from '@/types/workflow';
import { Json } from '@/types/common';
import { handleFormulaNode } from './workflow/handlers/dataTransform';
import { handleExcelInput } from './workflow/handlers/excelInput';
import { handleApiRequest } from './workflow/handlers/apiIntegration';
import { handleAiAnalysis } from './workflow/handlers/aiAnalysis';
import { handleSpreadsheetGeneration } from './workflow/handlers/spreadsheetGenerator';

export class WorkflowEngine {
  async getWorkflows(): Promise<Workflow[]> {
    try {
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      
      return data.map(mapDatabaseWorkflowToWorkflow);
    } catch (error) {
      console.error('Error fetching workflows:', error);
      throw error;
    }
  }
  
  async getWorkflow(id: string): Promise<Workflow> {
    try {
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      return mapDatabaseWorkflowToWorkflow(data);
    } catch (error) {
      console.error(`Error fetching workflow ${id}:`, error);
      throw error;
    }
  }
  
  async createWorkflow(workflow: Partial<Workflow>): Promise<Workflow> {
    try {
      const newWorkflow = {
        name: workflow.name || 'Untitled Workflow',
        description: workflow.description || '',
        definition: JSON.stringify(workflow.definition || { nodes: [], edges: [] }),
        is_template: workflow.is_template || false,
        tags: workflow.tags || []
      };
      
      const { data, error } = await supabase
        .from('workflows')
        .insert(newWorkflow)
        .select()
        .single();
      
      if (error) throw error;
      
      return mapDatabaseWorkflowToWorkflow(data);
    } catch (error) {
      console.error('Error creating workflow:', error);
      throw error;
    }
  }
  
  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
    try {
      const updateObject: any = {};
      
      if (updates.name !== undefined) updateObject.name = updates.name;
      if (updates.description !== undefined) updateObject.description = updates.description;
      if (updates.definition !== undefined) updateObject.definition = JSON.stringify(updates.definition);
      if (updates.is_template !== undefined) updateObject.is_template = updates.is_template;
      if (updates.tags !== undefined) updateObject.tags = updates.tags;
      
      const { data, error } = await supabase
        .from('workflows')
        .update(updateObject)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      return mapDatabaseWorkflowToWorkflow(data);
    } catch (error) {
      console.error(`Error updating workflow ${id}:`, error);
      throw error;
    }
  }
  
  async deleteWorkflow(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('workflows')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    } catch (error) {
      console.error(`Error deleting workflow ${id}:`, error);
      throw error;
    }
  }
  
  async executeWorkflow(workflowId: string, inputs: Record<string, any> = {}): Promise<WorkflowExecution> {
    try {
      const execution: WorkflowExecution = {
        workflow_id: workflowId,
        status: 'running',
        inputs,
        started_at: new Date().toISOString(),
        node_states: {}
      };
      
      const { data, error } = await supabase
        .from('workflow_executions')
        .insert(mapWorkflowExecutionToDatabaseExecution(execution))
        .select()
        .single();
      
      if (error) throw error;
      
      const executionRecord = mapDatabaseExecutionToWorkflowExecution(data);
      
      this.runWorkflow(executionRecord).catch(err => {
        console.error(`Error executing workflow ${workflowId}:`, err);
        this.updateExecutionStatus(executionRecord.id!, 'failed', { error: err.message });
      });
      
      return executionRecord;
    } catch (error) {
      console.error(`Error creating execution for workflow ${workflowId}:`, error);
      throw error;
    }
  }
  
  async getExecution(id: string): Promise<WorkflowExecution> {
    try {
      const { data, error } = await supabase
        .from('workflow_executions')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      return mapDatabaseExecutionToWorkflowExecution(data);
    } catch (error) {
      console.error(`Error fetching execution ${id}:`, error);
      throw error;
    }
  }
  
  async getExecutions(workflowId: string): Promise<WorkflowExecution[]> {
    try {
      const { data, error } = await supabase
        .from('workflow_executions')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('started_at', { ascending: false });
      
      if (error) throw error;
      
      return data.map(mapDatabaseExecutionToWorkflowExecution);
    } catch (error) {
      console.error(`Error fetching executions for workflow ${workflowId}:`, error);
      throw error;
    }
  }
  
  private async updateExecutionStatus(
    executionId: string, 
    status: WorkflowExecution['status'], 
    updates: Partial<WorkflowExecution> = {}
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        ...updates
      };
      
      if (status === 'completed' || status === 'failed') {
        updateData.completed_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('workflow_executions')
        .update(updateData)
        .eq('id', executionId);
      
      if (error) throw error;
    } catch (error) {
      console.error(`Error updating execution ${executionId} status:`, error);
      throw error;
    }
  }
  
  private async runWorkflow(execution: WorkflowExecution): Promise<void> {
    if (!execution.id) throw new Error('Execution ID is required');
    
    try {
      const workflow = await this.getWorkflow(execution.workflow_id);
      const { nodes, edges } = workflow.definition;
      
      const startNodeIds = this.findStartNodes(nodes, edges);
      
      if (startNodeIds.length === 0) {
        throw new Error('No start nodes found in workflow');
      }
      
      const nodeStates: Record<string, any> = {};
      nodes.forEach(node => {
        nodeStates[node.id] = {
          status: 'pending',
          inputs: {},
          outputs: {}
        };
      });
      
      await this.updateExecutionStatus(execution.id, 'running', { 
        node_states: nodeStates 
      });
      
      const promises = startNodeIds.map(nodeId => 
        this.executeNode(nodeId, execution.inputs || {}, nodes, edges, execution)
      );
      
      await Promise.all(promises);
      
      const updatedExecution = await this.getExecution(execution.id);
      const allCompleted = Object.values(updatedExecution.node_states || {})
        .every(state => state.status === 'completed' || state.status === 'skipped');
      
      if (allCompleted) {
        const terminalNodeIds = this.findTerminalNodes(nodes, edges);
        const outputs: Record<string, any> = {};
        
        terminalNodeIds.forEach(nodeId => {
          const nodeState = updatedExecution.node_states?.[nodeId];
          if (nodeState && nodeState.outputs) {
            outputs[nodeId] = nodeState.outputs;
          }
        });
        
        await this.updateExecutionStatus(execution.id, 'completed', { outputs });
      }
    } catch (error) {
      console.error(`Error executing workflow ${execution.workflow_id}:`, error);
      await this.updateExecutionStatus(execution.id, 'failed', { error: String(error) });
    }
  }
  
  private async executeNode(
    nodeId: string, 
    inputs: Record<string, any>,
    nodes: WorkflowNode[],
    edges: any[],
    execution: WorkflowExecution
  ): Promise<void> {
    if (!execution.id) return;
    
    try {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) throw new Error(`Node ${nodeId} not found`);
      
      const nodeStates = { 
        ...(execution.node_states || {}),
        [nodeId]: {
          ...(execution.node_states?.[nodeId] || {}),
          status: 'running',
          inputs
        }
      };
      
      await this.updateExecutionStatus(execution.id, 'running', { node_states: nodeStates });
      
      const handler = this.getNodeHandler(node.data);
      const outputs = await handler.execute(inputs, node.data.config);
      
      const updatedNodeStates = {
        ...(execution.node_states || {}),
        [nodeId]: {
          ...(execution.node_states?.[nodeId] || {}),
          status: 'completed',
          inputs,
          outputs
        }
      };
      
      await this.updateExecutionStatus(execution.id, 'running', { node_states: updatedNodeStates });
      
      const nextNodes = this.findNextNodes(nodeId, edges);
      
      const promises = nextNodes.map(nextNodeId => {
        const incomingEdges = edges.filter(edge => edge.target === nextNodeId);
        
        const nextInputs: Record<string, any> = {};
        
        incomingEdges.forEach(edge => {
          const sourceNodeState = updatedNodeStates[edge.source];
          if (sourceNodeState && sourceNodeState.outputs) {
            if (edge.sourceHandle && edge.targetHandle) {
              nextInputs[edge.targetHandle] = sourceNodeState.outputs[edge.sourceHandle];
            } else {
              Object.assign(nextInputs, sourceNodeState.outputs);
            }
          }
        });
        
        return this.executeNode(nextNodeId, nextInputs, nodes, edges, execution);
      });
      
      await Promise.all(promises);
    } catch (error) {
      console.error(`Error executing node ${nodeId}:`, error);
      
      const nodeStates = {
        ...(execution.node_states || {}),
        [nodeId]: {
          ...(execution.node_states?.[nodeId] || {}),
          status: 'failed',
          error: String(error)
        }
      };
      
      await this.updateExecutionStatus(execution.id, 'running', { node_states: nodeStates });
    }
  }
  
  private getNodeHandler(nodeData: WorkflowNodeData): NodeHandler {
    const type = nodeData.type;
    
    if (type === 'excelInput' || type === 'csvInput') {
      return { execute: handleExcelInput };
    } else if (type === 'formulaNode') {
      return { execute: handleFormulaNode };
    } else if (type === 'apiSource') {
      return { execute: handleApiRequest };
    } else if (type === 'aiAnalyze' || type === 'aiClassify' || type === 'aiSummarize') {
      return { execute: handleAiAnalysis };
    } else if (type === 'spreadsheetGenerator') {
      return { execute: handleSpreadsheetGeneration };
    }
    
    return {
      execute: async () => {
        throw new Error(`Node type '${type}' is not supported`);
      }
    };
  }
  
  private findStartNodes(nodes: WorkflowNode[], edges: any[]): string[] {
    const nodesWithIncomingEdges = new Set(edges.map(edge => edge.target));
    return nodes
      .filter(node => !nodesWithIncomingEdges.has(node.id))
      .map(node => node.id);
  }
  
  private findTerminalNodes(nodes: WorkflowNode[], edges: any[]): string[] {
    const nodesWithOutgoingEdges = new Set(edges.map(edge => edge.source));
    return nodes
      .filter(node => !nodesWithOutgoingEdges.has(node.id))
      .map(node => node.id);
  }
  
  private findNextNodes(nodeId: string, edges: any[]): string[] {
    return edges
      .filter(edge => edge.source === nodeId)
      .map(edge => edge.target);
  }
}

export default new WorkflowEngine();
