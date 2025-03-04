
import { supabase } from "@/integrations/supabase/client";
import { AIRequestData, isAIRequestData } from "@/types/workflow";

// Define error types that can be used throughout the application
export enum AIServiceErrorType {
  NO_FILES = "no_files",
  VERIFICATION_FAILED = "verification_failed",
  NETWORK_ERROR = "network_error",
  PROVIDER_ERROR = "provider_error",
  UNKNOWN_ERROR = "unknown_error"
}

// Custom error class for AI service errors
export class AIServiceError extends Error {
  type: AIServiceErrorType;
  
  constructor(message: string, type: AIServiceErrorType) {
    super(message);
    this.type = type;
    this.name = "AIServiceError";
  }
}

/**
 * Helper function to safely retrieve AI request data with proper type checking
 */
async function fetchAIRequests(query: any): Promise<AIRequestData[]> {
  try {
    const { data, error } = await query;
    
    if (error) {
      console.error("Error in fetchAIRequests:", error);
      throw new AIServiceError(error.message, AIServiceErrorType.NETWORK_ERROR);
    }
    
    // Filter and convert the data to ensure type safety
    const safeData: AIRequestData[] = [];
    
    if (Array.isArray(data)) {
      for (const item of data) {
        if (isAIRequestData(item)) {
          safeData.push(item);
        } else {
          console.warn('Retrieved item does not match AIRequestData shape:', item);
        }
      }
    }
    
    return safeData;
  } catch (error) {
    console.error('Error fetching AI requests:', error);
    if (error instanceof AIServiceError) {
      throw error;
    }
    throw new AIServiceError(
      error instanceof Error ? error.message : 'Unknown error occurred', 
      AIServiceErrorType.UNKNOWN_ERROR
    );
  }
}

/**
 * Fetch AI requests for a specific workflow
 */
export async function getWorkflowAIRequests(workflowId: string): Promise<AIRequestData[]> {
  // Use a type assertion for the table that isn't in the generated types
  const query = supabase
    .from('workflow_ai_requests' as any)
    .select('*')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: false });
  
  return fetchAIRequests(query);
}

/**
 * Fetch AI requests for a specific node
 */
export async function getNodeAIRequests(workflowId: string, nodeId: string): Promise<AIRequestData[]> {
  // Use a type assertion for the table that isn't in the generated types
  const query = supabase
    .from('workflow_ai_requests' as any)
    .select('*')
    .eq('workflow_id', workflowId)
    .eq('node_id', nodeId)
    .order('created_at', { ascending: false });
  
  return fetchAIRequests(query);
}

/**
 * Fetch a specific AI request by ID
 */
export async function getAIRequestById(requestId: string): Promise<AIRequestData | null> {
  try {
    // Use a type assertion for the table that isn't in the generated types
    const { data, error } = await supabase
      .from('workflow_ai_requests' as any)
      .select('*')
      .eq('id', requestId)
      .single();
    
    if (error) {
      console.error("Error fetching AI request by ID:", error);
      throw new AIServiceError(error.message, AIServiceErrorType.NETWORK_ERROR);
    }
    
    return isAIRequestData(data) ? data : null;
  } catch (error) {
    console.error('Error fetching AI request:', error);
    if (error instanceof AIServiceError) {
      throw error;
    }
    throw new AIServiceError(
      error instanceof Error ? error.message : 'Unknown error occurred', 
      AIServiceErrorType.UNKNOWN_ERROR
    );
  }
}

/**
 * Fetch the most recent AI request for a node
 */
export async function getLatestNodeRequest(workflowId: string, nodeId: string): Promise<AIRequestData | null> {
  try {
    // Use a type assertion for the table that isn't in the generated types
    const { data, error } = await supabase
      .from('workflow_ai_requests' as any)
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error("Error fetching latest node request:", error);
      throw new AIServiceError(error.message, AIServiceErrorType.NETWORK_ERROR);
    }
    
    return isAIRequestData(data) ? data : null;
  } catch (error) {
    console.error('Error fetching latest node request:', error);
    return null;
  }
}

/**
 * Subscribe to realtime updates for an AI request
 */
export function subscribeToAIRequest(
  requestId: string, 
  onUpdate: (request: AIRequestData) => void
): () => void {
  const channel = supabase
    .channel(`ai-request-${requestId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'workflow_ai_requests',
        filter: `id=eq.${requestId}`
      },
      (payload) => {
        // Only call the callback if the data matches our expected type
        if (isAIRequestData(payload.new)) {
          onUpdate(payload.new as AIRequestData);
        } else {
          console.error('Received invalid AI request data:', payload.new);
        }
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Ask the AI a question via the edge function
 */
export async function askAI({
  workflowId,
  nodeId,
  executionId,
  aiProvider,
  userQuery,
  systemMessage,
  modelName
}: {
  workflowId: string;
  nodeId: string;
  executionId: string;
  aiProvider: 'openai' | 'anthropic' | 'deepseek';
  userQuery: string;
  systemMessage?: string;
  modelName?: string;
}): Promise<{
  success: boolean;
  requestId?: string;
  aiResponse?: string;
  error?: string;
}> {
  try {
    const response = await supabase.functions.invoke('ask-ai', {
      body: {
        workflowId,
        nodeId,
        executionId,
        aiProvider,
        userQuery,
        systemMessage,
        modelName
      }
    });

    if (response.error) {
      throw new Error(response.error.message || 'Failed to invoke AI function');
    }

    const { success, aiResponse, error, requestId } = response.data;

    if (!success || error) {
      throw new Error(error || 'Failed to get response from AI');
    }

    return { 
      success: true, 
      aiResponse, 
      requestId 
    };
  } catch (error) {
    console.error('Error asking AI:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

// Create a function to update the node's config with the AI response
export async function updateNodeWithAIResponse({
  workflowId,
  nodeId,
  aiResponse,
  executionId
}: {
  workflowId: string;
  nodeId: string;
  aiResponse: string;
  executionId: string;
}): Promise<boolean> {
  try {
    // Create the node state object
    const nodeState = {
      lastResponse: aiResponse,
      lastResponseTime: new Date().toISOString()
    };

    // Update the node state in the workflow execution
    const { error } = await supabase
      .from('workflow_executions')
      .update({
        node_states: supabase.storage.from('node_states').getPublicUrl(`${nodeId}`)
      })
      .eq('id', executionId)
      .eq('workflow_id', workflowId);

    if (error) {
      console.error('Error updating node with AI response:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating node with AI response:', error);
    return false;
  }
}

// Function to trigger AI response in workflow execution
export async function triggerAIResponse({
  workflowId,
  nodeId,
  executionId,
  nodeConfig
}: {
  workflowId: string;
  nodeId: string;
  executionId: string;
  nodeConfig: any;
}): Promise<{
  success: boolean;
  response?: string;
  error?: string;
}> {
  try {
    if (!nodeConfig.prompt) {
      return { 
        success: false, 
        error: 'No prompt provided in node configuration' 
      };
    }

    const aiProvider = nodeConfig.aiProvider || 'openai';
    const modelName = nodeConfig.modelName || 
      (aiProvider === 'openai' ? 'gpt-4o-mini' : 
       aiProvider === 'anthropic' ? 'claude-3-haiku-20240307' : 
       'deepseek-chat');
    
    const result = await askAI({
      workflowId,
      nodeId,
      executionId,
      aiProvider,
      userQuery: nodeConfig.prompt,
      systemMessage: nodeConfig.systemMessage,
      modelName
    });

    if (!result.success) {
      return { 
        success: false, 
        error: result.error || 'Failed to get AI response' 
      };
    }

    // Update the node with the AI response using direct approach
    const { error } = await supabase
      .from('workflow_executions')
      .update({
        node_states: {
          ...((await supabase
            .from('workflow_executions')
            .select('node_states')
            .eq('id', executionId)
            .single()).data?.node_states || {}),
          [nodeId]: {
            lastResponse: result.aiResponse || '',
            lastResponseTime: new Date().toISOString()
          }
        }
      })
      .eq('id', executionId)
      .eq('workflow_id', workflowId);

    if (error) {
      console.error('Error updating node with AI response:', error);
      return {
        success: false,
        error: error.message
      };
    }

    return {
      success: true,
      response: result.aiResponse
    };
  } catch (error) {
    console.error('Error triggering AI response:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
