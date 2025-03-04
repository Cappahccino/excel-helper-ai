
import { supabase } from '@/integrations/supabase/client';
import { AIRequestData } from '@/types/workflow';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

// Function to update an AI node's state in a workflow
export async function updateAINodeState(
  workflowId: string, 
  nodeId: string, 
  changes: {
    prompt?: string;
    aiProvider?: string;
    modelName?: string;
    systemMessage?: string;
    lastResponse?: string;
    lastResponseTime?: string;
    [key: string]: any;
  }
) {
  try {
    // Get the current workflow first
    const { data: workflow, error: fetchError } = await supabase
      .from('workflows')
      .select('definition')
      .eq('id', workflowId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching workflow:', fetchError);
      return { success: false, error: fetchError };
    }
    
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }
    
    // Parse the definition
    let definition;
    try {
      definition = typeof workflow.definition === 'string' 
        ? JSON.parse(workflow.definition) 
        : workflow.definition;
    } catch (parseError) {
      console.error('Error parsing workflow definition:', parseError);
      return { success: false, error: parseError };
    }
    
    // Find the node and update it
    let nodeUpdated = false;
    
    if (definition.nodes && Array.isArray(definition.nodes)) {
      for (let i = 0; i < definition.nodes.length; i++) {
        if (definition.nodes[i].id === nodeId) {
          // Update the node configuration
          definition.nodes[i].data = {
            ...definition.nodes[i].data,
            config: {
              ...definition.nodes[i].data.config,
              ...changes
            }
          };
          nodeUpdated = true;
          break;
        }
      }
    }
    
    if (!nodeUpdated) {
      return { success: false, error: 'Node not found in workflow' };
    }
    
    // Update the workflow with the new definition
    const { error: updateError } = await supabase
      .from('workflows')
      .update({
        definition: JSON.stringify(definition)
      })
      .eq('id', workflowId);
    
    if (updateError) {
      console.error('Error updating workflow:', updateError);
      return { success: false, error: updateError };
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('Error in updateAINodeState:', error);
    return { success: false, error };
  }
}

// Function to trigger an AI response from a workflow node
export async function triggerAIResponse(
  workflowId: string,
  nodeId: string,
  executionId: string,
  query: string,
  provider: 'openai' | 'anthropic' | 'deepseek',
  modelName: string,
  systemMessage?: string
) {
  try {
    // Create a request ID
    const requestId = uuidv4();
    
    // Prepare the request data
    const requestData: AIRequestData = {
      id: requestId,
      workflow_id: workflowId,
      node_id: nodeId,
      execution_id: executionId,
      ai_provider: provider,
      user_query: query,
      status: 'pending',
      created_at: new Date().toISOString(),
      model_name: modelName,
      system_message: systemMessage
    };
    
    // Save the request to the database
    const { data, error } = await supabase
      .from('workflow_ai_requests')
      .insert(requestData)
      .select('id')
      .single();
    
    if (error) {
      console.error('Error creating AI request:', error);
      toast.error('Failed to create AI request');
      return { success: false, error };
    }
    
    // Update the node state to indicate it's processing
    await updateAINodeState(workflowId, nodeId, {
      lastResponseTime: new Date().toISOString(),
      processingStatus: 'running'
    });
    
    // Return the request ID so the client can poll for updates
    return {
      success: true,
      requestId: data.id,
      message: 'AI request created and is being processed'
    };
    
  } catch (error) {
    console.error('Error in triggerAIResponse:', error);
    toast.error('Failed to trigger AI response');
    return { success: false, error };
  }
}

// Function to check the status of an AI request
export async function checkAIRequestStatus(requestId: string) {
  try {
    const { data, error } = await supabase
      .from('workflow_ai_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    
    if (error) {
      console.error('Error checking AI request status:', error);
      return { success: false, error };
    }
    
    if (!data) {
      return { success: false, error: 'AI request not found' };
    }
    
    return {
      success: true,
      status: data.status,
      response: data.ai_response,
      error: data.error_message,
      tokenUsage: data.token_usage,
      completedAt: data.completed_at
    };
    
  } catch (error) {
    console.error('Error in checkAIRequestStatus:', error);
    return { success: false, error };
  }
}
