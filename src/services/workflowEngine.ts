
import { WorkflowDefinition, WorkflowNode, Edge, WorkflowExecution, NodeExecutionContext, NodeType } from '@/types/workflow';
import { supabase } from '@/integrations/supabase/client';
import { dataProcessing } from './workflow/handlers/dataProcessing';
import { executeDataTransform } from './workflow/handlers/dataTransform';
import { executeAIAnalysis } from './workflow/handlers/aiAnalysis';
import { executeApiIntegration } from './workflow/handlers/apiIntegration';
import { executeExcelInput } from './workflow/handlers/excelInput';
import { executeSpreadsheetGenerator } from './workflow/handlers/spreadsheetGenerator';

interface NodeOptions {
  nodeId: string;
  workflowId: string;
  executionId: string;
}

export const processNode = async (
  nodeType: string,
  nodeData: any,
  options: NodeOptions,
  previousNodeOutput?: any
) => {
  try {
    console.log(`Processing node of type ${nodeType}:`, nodeData);
    
    let result;
    
    switch (nodeType) {
      case 'dataInput':
        result = await executeExcelInput(nodeData, options);
        break;
      case 'dataProcessing':
        result = await dataProcessing(nodeData, options, previousNodeOutput);
        break;
      case 'aiNode':
        result = await executeAIAnalysis(nodeData, options, previousNodeOutput);
        break;
      case 'outputNode':
        result = await executeDataTransform(nodeData, options, previousNodeOutput);
        break;
      case 'integrationNode':
        result = await executeApiIntegration(nodeData, options, previousNodeOutput);
        break;
      case 'spreadsheetGenerator':
        result = await executeSpreadsheetGenerator(nodeData, options, previousNodeOutput);
        break;
      default:
        console.log(`Unknown node type: ${nodeType}`);
        result = { success: false, error: `Unknown node type: ${nodeType}` };
    }
    
    if (result.success) {
      await updateNodeState(options.executionId, options.nodeId, "completed", result.data);
    } else {
      await updateNodeState(options.executionId, options.nodeId, "error", { error: result.error });
    }
    
    return result;
  } catch (error) {
    console.error(`Error processing node ${options.nodeId}:`, error);
    
    await updateNodeState(
      options.executionId,
      options.nodeId,
      "error",
      { error: error instanceof Error ? error.message : String(error) }
    );
    
    return { success: false, error };
  }
};

async function updateNodeState(executionId: string, nodeId: string, status: string, output: any) {
  try {
    const { data, error } = await supabase
      .from('workflow_executions')
      .select('node_states')
      .eq('id', executionId)
      .single();
    
    if (error) throw error;
    
    let nodeStates = data.node_states || {};
    nodeStates[nodeId] = {
      ...nodeStates[nodeId],
      status,
      output,
      updated_at: new Date().toISOString()
    };
    
    const { error: updateError } = await supabase
      .from('workflow_executions')
      .update({ node_states: nodeStates })
      .eq('id', executionId);
    
    if (updateError) throw updateError;
  } catch (error) {
    console.error("Error updating workflow node state:", error);
  }
}
