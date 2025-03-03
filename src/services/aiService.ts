
import { supabase } from "@/integrations/supabase/client";
import { AIRequestData } from "@/types/workflow";

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
 * Fetch AI requests for a specific workflow
 */
export async function getWorkflowAIRequests(workflowId: string): Promise<AIRequestData[]> {
  try {
    const { data, error } = await supabase
      .from('workflow_ai_requests')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return data as AIRequestData[] || [];
  } catch (error) {
    console.error('Error fetching AI requests:', error);
    throw error;
  }
}

/**
 * Fetch AI requests for a specific node
 */
export async function getNodeAIRequests(workflowId: string, nodeId: string): Promise<AIRequestData[]> {
  try {
    const { data, error } = await supabase
      .from('workflow_ai_requests')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return data as AIRequestData[] || [];
  } catch (error) {
    console.error('Error fetching node AI requests:', error);
    throw error;
  }
}

/**
 * Fetch a specific AI request by ID
 */
export async function getAIRequestById(requestId: string): Promise<AIRequestData | null> {
  try {
    const { data, error } = await supabase
      .from('workflow_ai_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    
    if (error) throw error;
    
    return data as AIRequestData;
  } catch (error) {
    console.error('Error fetching AI request:', error);
    throw error;
  }
}

/**
 * Fetch the most recent AI request for a node
 */
export async function getLatestNodeRequest(workflowId: string, nodeId: string): Promise<AIRequestData | null> {
  try {
    const { data, error } = await supabase
      .from('workflow_ai_requests')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw error;
    }
    
    return data as AIRequestData || null;
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
        onUpdate(payload.new as AIRequestData);
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

// Placeholder for other AI service functions until they're implemented
export function triggerAIResponse(params: any): Promise<any> {
  console.error('triggerAIResponse is referenced but not yet implemented');
  return Promise.reject(new AIServiceError('Not implemented', AIServiceErrorType.UNKNOWN_ERROR));
}
