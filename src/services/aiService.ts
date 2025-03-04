
import { supabase } from '@/integrations/supabase/client';
import { AIRequestData } from '@/types/workflow';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

// Define AIServiceErrorType enum that's being imported elsewhere
export enum AIServiceErrorType {
  NO_FILES = 'no_files',
  VERIFICATION_FAILED = 'verification_failed',
  NETWORK_ERROR = 'network_error',
  UNKNOWN = 'unknown'
}

// Define AIServiceError class that's being imported elsewhere
export class AIServiceError extends Error {
  type: AIServiceErrorType;
  
  constructor(message: string, type: AIServiceErrorType = AIServiceErrorType.UNKNOWN) {
    super(message);
    this.type = type;
    this.name = 'AIServiceError';
  }
}

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
    
    // Since workflow_ai_requests isn't in the Supabase types, we need to use the RPC approach
    // or insert directly with custom SQL
    
    // Update directly using REST API call to bypass type limitations
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/workflow_ai_requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY || '',
        'Authorization': `Bearer ${supabase.auth.getSession()}`
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      console.error('Error creating AI request:', await response.text());
      toast.error('Failed to create AI request');
      return { success: false, error: 'Database error' };
    }
    
    // Update the node state to indicate it's processing
    await updateAINodeState(workflowId, nodeId, {
      lastResponseTime: new Date().toISOString(),
      processingStatus: 'running'
    });
    
    // Return the request ID so the client can poll for updates
    return {
      success: true,
      requestId: requestId,
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
    // Since workflow_ai_requests isn't in the Supabase types, use a direct REST API call
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/workflow_ai_requests?id=eq.${requestId}&select=*`, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY || '',
        'Authorization': `Bearer ${supabase.auth.getSession()}`
      }
    });
    
    if (!response.ok) {
      console.error('Error checking AI request status:', await response.text());
      return { success: false, error: 'Database error' };
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      return { success: false, error: 'AI request not found' };
    }
    
    const aiRequest = data[0];
    
    return {
      success: true,
      status: aiRequest.status,
      response: aiRequest.ai_response,
      error: aiRequest.error_message,
      tokenUsage: aiRequest.token_usage,
      completedAt: aiRequest.completed_at
    };
    
  } catch (error) {
    console.error('Error in checkAIRequestStatus:', error);
    return { success: false, error };
  }
}

// Adding missing exports that are imported in other files
export async function askAI(workflowId: string, nodeId: string, query: string, provider: string, model: string) {
  // Implementation placeholder - this is needed for useAINode.ts
  const executionId = uuidv4(); // Generate an execution ID since it's required
  return triggerAIResponse(workflowId, nodeId, executionId, query, provider as 'openai' | 'anthropic' | 'deepseek', model);
}

export async function getNodeAIRequests(workflowId: string, nodeId: string) {
  // Implementation placeholder - this is needed for useAINode.ts
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/workflow_ai_requests?workflow_id=eq.${workflowId}&node_id=eq.${nodeId}&select=*&order=created_at.desc`, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY || '',
        'Authorization': `Bearer ${supabase.auth.getSession()}`
      }
    });
    
    if (!response.ok) {
      return { success: false, error: 'Failed to fetch AI requests' };
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error in getNodeAIRequests:', error);
    return { success: false, error };
  }
}

export function subscribeToAIRequest(requestId: string, callback: (status: any) => void) {
  // Implementation placeholder - this is needed for useAINode.ts
  // This would typically use Supabase realtime subscriptions
  
  const channel = supabase
    .channel(`ai-request-${requestId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'workflow_ai_requests',
      filter: `id=eq.${requestId}`
    }, (payload) => {
      callback(payload.new);
    })
    .subscribe();
  
  // Return an unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}
