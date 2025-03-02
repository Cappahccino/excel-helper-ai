import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { Json } from "@supabase/supabase-js";

export interface Workflow {
  id: string;
  name: string;
  description: string;
  definition: Json;
  created_at: string;
  created_by: string;
  updated_at: string;
  version: number;
  is_template: boolean;
  folder_id: string;
  last_run_at: string;
  last_run_status: string;
  icon: string;
  color: string;
}

export interface Node {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: any;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export interface Execution {
  id: string;
  workflow_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  log: Json;
}

export interface ExecutionNode {
  id: string;
  execution_id: string;
  node_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  log: Json;
}

export interface ExecutionEdge {
  id: string;
  execution_id: string;
  edge_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  log: Json;
}

export interface WorkflowEngineParams {
  supabase: SupabaseClient<Database>;
  workflowId: string;
  inputs?: { [key: string]: any };
}

export class WorkflowEngine {
  private supabase: SupabaseClient<Database>;
  private workflowId: string;
  private workflow?: Workflow;
  private nodes?: Node[];
  private edges?: Edge[];
  private inputs?: { [key: string]: any };
  private executionId?: string;

  constructor(params: WorkflowEngineParams) {
    this.supabase = params.supabase;
    this.workflowId = params.workflowId;
    this.inputs = params.inputs;
  }

  async init() {
    try {
      // Get workflow from database
      const { data: workflow, error: workflowError } = await this.supabase
        .from('workflows')
        .select('*')
        .eq('id', this.workflowId)
        .single();

      if (workflowError) {
        throw new Error(`Error fetching workflow: ${workflowError.message}`);
      }

      if (!workflow) {
        throw new Error(`Workflow not found: ${this.workflowId}`);
      }

      this.workflow = workflow;

      // Get nodes and edges from workflow definition
      const definition = JSON.parse(this.workflow.definition as string);
      this.nodes = definition.nodes;
      this.edges = definition.edges;

      if (!this.nodes || !this.edges) {
        throw new Error(`Workflow definition is invalid: ${this.workflowId}`);
      }

      // Create execution
      const { data: execution, error: executionError } = await this.supabase
        .from('executions')
        .insert({
          workflow_id: this.workflowId,
          status: 'running',
          log: {
            init: 'Workflow execution started',
          },
        })
        .select('*')
        .single();

      if (executionError) {
        throw new Error(`Error creating execution: ${executionError.message}`);
      }

      if (!execution) {
        throw new Error(`Error creating execution: ${this.workflowId}`);
      }

      this.executionId = execution.id;

      console.log(`Workflow ${this.workflowId} execution ${this.executionId} started`);

    } catch (error: any) {
      console.error(`Error initializing workflow engine: ${error.message}`);
      throw error;
    }
  }

  async run() {
    if (!this.workflow || !this.nodes || !this.edges || !this.executionId) {
      throw new Error(`Workflow engine not initialized`);
    }

    try {
      // Get start node
      const startNode = this.nodes.find((node) => node.type === 'start');

      if (!startNode) {
        throw new Error(`Workflow ${this.workflowId} does not have a start node`);
      }

      // Run workflow
      await this.runNode(startNode, this.inputs);

      // Update execution status
      await this.supabase
        .from('executions')
        .update({
          status: 'completed',
          log: {
            completed: 'Workflow execution completed',
          },
        })
        .eq('id', this.executionId);

      console.log(`Workflow ${this.workflowId} execution ${this.executionId} completed`);

    } catch (error: any) {
      console.error(`Error running workflow: ${error.message}`);

      // Update execution status
      await this.supabase
        .from('executions')
        .update({
          status: 'failed',
          log: {
            error: error.message,
          },
        })
        .eq('id', this.executionId);

      throw error;
    }
  }

  async runNode(node: Node, inputs: { [key: string]: any } | undefined) {
    if (!this.supabase || !this.executionId) {
      throw new Error(`Workflow engine not initialized`);
    }

    try {
      // Create execution node
      const { data: executionNode, error: executionNodeError } = await this.supabase
        .from('execution_nodes')
        .insert({
          execution_id: this.executionId,
          node_id: node.id,
          status: 'running',
          log: {
            init: `Node ${node.id} execution started`,
          },
        })
        .select('*')
        .single();

      if (executionNodeError) {
        throw new Error(`Error creating execution node: ${executionNodeError.message}`);
      }

      if (!executionNode) {
        throw new Error(`Error creating execution node: ${node.id}`);
      }

      // Get node handler
      const nodeHandler = this.getNodeHandler(node.type);

      if (!nodeHandler) {
        throw new Error(`Node handler not found: ${node.type}`);
      }

      // Run node
      const outputs = await nodeHandler({
        supabase: this.supabase,
        node,
        inputs,
        executionId: this.executionId,
        executionNodeId: executionNode.id,
      });

      // Update execution node status
      await this.supabase
        .from('execution_nodes')
        .update({
          status: 'completed',
          log: {
            completed: `Node ${node.id} execution completed`,
            outputs,
          },
        })
        .eq('id', executionNode.id);

      // Get next nodes
      const nextNodes = this.getNextNodes(node);

      // Run next nodes
      for (const nextNode of nextNodes) {
        await this.runNode(nextNode, outputs);
      }

    } catch (error: any) {
      console.error(`Error running node ${node.id}: ${error.message}`);

      // Update execution node status
      await this.supabase
        .from('execution_nodes')
        .update({
          status: 'failed',
          log: {
            error: error.message,
          },
        })
        .eq('id', node.id);

      throw error;
    }
  }

  getNodeHandler(nodeType: string) {
    switch (nodeType) {
      case 'dataInput':
        return async ({ node }: { node: Node }) => {
          // Return node data config as outputs
          return node.data.config;
        };
      case 'dataTransform':
        return async ({ node, inputs }: { node: Node, inputs: { [key: string]: any } | undefined }) => {
          if (!inputs) {
            throw new Error(`Data transform node ${node.id} requires inputs`);
          }

          // Get transform function from node data config
          const transformFunction = node.data.config.transformFunction;

          if (!transformFunction) {
            throw new Error(`Data transform node ${node.id} does not have a transform function`);
          }

          // Run transform function
          const outputs = new Function('inputs', transformFunction)(inputs);

          return outputs;
        };
      default:
        return null;
    }
  }

  getNextNodes(node: Node): Node[] {
    if (!this.edges || !this.nodes) {
      return [];
    }

    // Get next edges
    const nextEdges = this.edges.filter((edge) => edge.source === node.id);

    // Get next nodes
    const nextNodes = nextEdges.map((edge) => {
      const nextNode = this.nodes?.find((node) => node.id === edge.target);
      if (!nextNode) {
        throw new Error(`Node not found: ${edge.target}`);
      }
      return nextNode;
    });

    return nextNodes;
  }

  static async getWorkflows(supabase: SupabaseClient<Database>) {
    const { data, error } = await supabase
      .from('workflows')
      .select('*');

    if (error) {
      console.error('Error fetching workflows:', error);
      return [];
    }

    return data || [];
  }

  static async getWorkflow(supabase: SupabaseClient<Database>, workflowId: string) {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (error) {
      console.error('Error fetching workflow:', error);
      return null;
    }

    return data || null;
  }

  static async duplicateWorkflow(supabase: SupabaseClient<Database>, workflowId: string, userId: string) {
    try {
      // Fetch the original workflow
      const { data: workflow, error: workflowError } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .single();

      if (workflowError) {
        throw new Error(`Error fetching workflow: ${workflowError.message}`);
      }

      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      // Extract relevant data for duplication
      const { name, description, definition, folder_id, is_template, icon, color } = workflow;

      const createdBy = workflow.created_by;
      const workflowTags: any[] = []; // Use a default empty array if tags don't exist

      // Create a new workflow with the same data
      const { data: newWorkflow, error: newWorkflowError } = await supabase
        .from('workflows')
        .insert({
          name: `${name} - Copy`,
          description,
          definition,
          created_by: userId,
          folder_id,
          is_template,
          icon,
          color,
          user_id: userId,
          tags: workflowTags,
        })
        .select('*')
        .single();

      if (newWorkflowError) {
        throw new Error(`Error creating workflow: ${newWorkflowError.message}`);
      }

      if (!newWorkflow) {
        throw new Error(`Error creating workflow copy for workflow: ${workflowId}`);
      }

      return newWorkflow;

    } catch (error: any) {
      console.error(`Error duplicating workflow: ${error.message}`);
      throw error;
    }
  }
}
