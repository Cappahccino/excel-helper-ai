import { WorkflowDefinition, WorkflowNode, Edge, WorkflowExecution, NodeExecutionContext } from '@/types/workflow';
import { supabase } from '@/integrations/supabase/client';

export class WorkflowEngine {
  nodes: WorkflowNode[];
  edges: Edge[];
  executionId: string | null = null;
  executionStatus: 'pending' | 'running' | 'completed' | 'failed' = 'pending';
  nodeStates: Record<string, any> = {};
  
  constructor(definition: WorkflowDefinition) {
    this.nodes = definition.nodes;
    this.edges = definition.edges;
  }
  
  async execute(inputs: Record<string, any> = {}): Promise<WorkflowExecution> {
    try {
      this.executionStatus = 'running';
      
      // Find start nodes (nodes with no incoming edges)
      const startNodeIds = this.findStartNodes();
      if (startNodeIds.length === 0) {
        throw new Error("No start nodes found in the workflow");
      }
      
      // Execute each start node and follow the flow
      for (const nodeId of startNodeIds) {
        await this.executeNode(nodeId, inputs);
      }
      
      this.executionStatus = 'completed';
      
      // Create the execution result
      return {
        workflow_id: '', // This would be set by the caller
        status: this.executionStatus,
        inputs,
        outputs: this.collectOutputs(),
        node_states: this.nodeStates,
      };
    } catch (error) {
      this.executionStatus = 'failed';
      
      console.error('Workflow execution failed:', error);
      
      return {
        workflow_id: '', // This would be set by the caller
        status: this.executionStatus,
        inputs,
        error: error instanceof Error ? error.message : 'Unknown error',
        node_states: this.nodeStates,
      };
    }
  }
  
  private findStartNodes(): string[] {
    // Get all target nodes (nodes with incoming edges)
    const targetNodeIds = new Set(this.edges.map(edge => edge.target));
    
    // Find nodes that are not targets (no incoming edges)
    return this.nodes
      .filter(node => !targetNodeIds.has(node.id))
      .map(node => node.id);
  }
  
  private async executeNode(nodeId: string, inputs: Record<string, any> = {}): Promise<any> {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) {
      throw new Error(`Node with ID ${nodeId} not found`);
    }
    
    // Skip if node already executed
    if (this.nodeStates[nodeId] && this.nodeStates[nodeId].status === 'completed') {
      return this.nodeStates[nodeId].outputs;
    }
    
    // Mark node as running
    this.nodeStates[nodeId] = {
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    
    try {
      // Get inputs from predecessor nodes
      const nodeInputs = await this.collectNodeInputs(nodeId, inputs);
      
      // Execute node based on type
      let outputs = {};
      
      switch (node.data?.type) {
        case 'fileUpload':
          outputs = await this.executeFileUploadNode(node, nodeInputs);
          break;
        // Handle other node types
        case 'dataInput':
          outputs = await this.executeDataInputNode(node, nodeInputs);
          break;
        case 'dataProcessing':
          outputs = await this.executeDataProcessingNode(node, nodeInputs);
          break;
        case 'aiNode':
          outputs = await this.executeAINode(node, nodeInputs);
          break;
        case 'outputNode':
          outputs = await this.executeOutputNode(node, nodeInputs);
          break;
        case 'integrationNode':
          outputs = await this.executeIntegrationNode(node, nodeInputs);
          break;
        case 'controlNode':
          outputs = await this.executeControlNode(node, nodeInputs);
          break;
        case 'spreadsheetGenerator':
          outputs = await this.executeSpreadsheetGeneratorNode(node, nodeInputs);
          break;
        default:
          outputs = { data: null, message: 'Node type not implemented' };
      }
      
      // Mark node as completed
      this.nodeStates[nodeId] = {
        ...this.nodeStates[nodeId],
        status: 'completed',
        completedAt: new Date().toISOString(),
        inputs: nodeInputs,
        outputs,
      };
      
      // Find and execute successor nodes
      const successorNodeIds = this.findSuccessorNodes(nodeId);
      for (const successorId of successorNodeIds) {
        await this.executeNode(successorId, inputs);
      }
      
      return outputs;
    } catch (error) {
      // Mark node as failed
      this.nodeStates[nodeId] = {
        ...this.nodeStates[nodeId],
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      
      throw error;
    }
  }
  
  private async executeFileUploadNode(node: WorkflowNode, inputs: Record<string, any>): Promise<any> {
    if (!node.data?.config?.fileId) {
      throw new Error("No file selected for file upload node");
    }
    
    try {
      // Get file metadata
      const { data: fileData, error: fileError } = await supabase
        .from('excel_files')
        .select(`
          id, 
          filename, 
          file_path, 
          file_size,
          mime_type,
          file_metadata (
            column_definitions,
            row_count
          )
        `)
        .eq('id', node.data.config.fileId)
        .single();
      
      if (fileError) throw fileError;
      if (!fileData) throw new Error("File not found");
      
      // Get file data for preview
      const { data: fileContent, error: storageError } = await supabase.storage
        .from('excel_files')
        .download(fileData.file_path);
      
      if (storageError) throw storageError;
      
      // Return file metadata and first few rows
      return {
        fileId: fileData.id,
        fileName: fileData.filename,
        fileSize: fileData.file_size,
        mimeType: fileData.mime_type,
        metadata: fileData.file_metadata,
        hasHeaders: node.data.config.hasHeaders || false,
        // We don't return the full file content in the outputs
        // as it could be very large
        previewAvailable: true
      };
    } catch (error) {
      console.error('Error executing file upload node:', error);
      throw error;
    }
  }
  
  private async collectNodeInputs(nodeId: string, globalInputs: Record<string, any>): Promise<Record<string, any>> {
    // Find all incoming edges to this node
    const incomingEdges = this.edges.filter(edge => edge.target === nodeId);
    
    // If no incoming edges, use global inputs
    if (incomingEdges.length === 0) {
      return { ...globalInputs };
    }
    
    // Collect outputs from all predecessor nodes
    const collectedInputs = { ...globalInputs };
    
    for (const edge of incomingEdges) {
      const sourceNodeId = edge.source;
      const sourceOutputs = await this.executeNode(sourceNodeId, globalInputs);
      
      // Add source outputs to collected inputs
      Object.assign(collectedInputs, {
        [sourceNodeId]: sourceOutputs,
      });
    }
    
    return collectedInputs;
  }
  
  private findSuccessorNodes(nodeId: string): string[] {
    // Find all outgoing edges from this node
    const outgoingEdges = this.edges.filter(edge => edge.source === nodeId);
    
    // Return target node IDs
    return outgoingEdges.map(edge => edge.target);
  }
  
  private collectOutputs(): Record<string, any> {
    // Find end nodes (nodes with no outgoing edges)
    const endNodeIds = this.findEndNodes();
    
    // Collect outputs from all end nodes
    const outputs: Record<string, any> = {};
    
    for (const nodeId of endNodeIds) {
      if (
        this.nodeStates[nodeId] && 
        this.nodeStates[nodeId].status === 'completed' &&
        this.nodeStates[nodeId].outputs
      ) {
        outputs[nodeId] = this.nodeStates[nodeId].outputs;
      }
    }
    
    return outputs;
  }
  
  private findEndNodes(): string[] {
    // Get all source nodes (nodes with outgoing edges)
    const sourceNodeIds = new Set(this.edges.map(edge => edge.source));
    
    // Find nodes that are not sources (no outgoing edges)
    return this.nodes
      .filter(node => !sourceNodeIds.has(node.id))
      .map(node => node.id);
  }

  private async executeDataInputNode(node: WorkflowNode, inputs: Record<string, any>): Promise<any> {
    // Implementation for Data Input Node
    console.log(`Executing Data Input Node ${node.id} with inputs:`, inputs);
    return { data: `Data Input Node ${node.id} executed`, inputs };
  }

  private async executeDataProcessingNode(node: WorkflowNode, inputs: Record<string, any>): Promise<any> {
    // Implementation for Data Processing Node
    console.log(`Executing Data Processing Node ${node.id} with inputs:`, inputs);
    return { data: `Data Processing Node ${node.id} executed`, inputs };
  }

  private async executeAINode(node: WorkflowNode, inputs: Record<string, any>): Promise<any> {
    // Implementation for AI Node
    console.log(`Executing AI Node ${node.id} with inputs:`, inputs);
    return { data: `AI Node ${node.id} executed`, inputs };
  }

  private async executeOutputNode(node: WorkflowNode, inputs: Record<string, any>): Promise<any> {
    // Implementation for Output Node
    console.log(`Executing Output Node ${node.id} with inputs:`, inputs);
    return { data: `Output Node ${node.id} executed`, inputs };
  }

  private async executeIntegrationNode(node: WorkflowNode, inputs: Record<string, any>): Promise<any> {
    // Implementation for Integration Node
    console.log(`Executing Integration Node ${node.id} with inputs:`, inputs);
    return { data: `Integration Node ${node.id} executed`, inputs };
  }

  private async executeControlNode(node: WorkflowNode, inputs: Record<string, any>): Promise<any> {
    // Implementation for Control Node
    console.log(`Executing Control Node ${node.id} with inputs:`, inputs);
    return { data: `Control Node ${node.id} executed`, inputs };
  }

  private async executeSpreadsheetGeneratorNode(node: WorkflowNode, inputs: Record<string, any>): Promise<any> {
    // Implementation for Spreadsheet Generator Node
    console.log(`Executing Spreadsheet Generator Node ${node.id} with inputs:`, inputs);
    return { data: `Spreadsheet Generator Node ${node.id} executed`, inputs };
  }
}
