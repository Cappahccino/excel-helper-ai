
import { supabase } from '@/integrations/supabase/client';
import { AIRequestData, AIRequestStatus } from '@/types/workflow';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Constants
const TIMEOUT_MS = 60000; // 1 minute timeout for network requests
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Extended error types for better error handling
 */
export enum AIServiceErrorType {
  NO_FILES = 'no_files',
  VERIFICATION_FAILED = 'verification_failed',
  NETWORK_ERROR = 'network_error',
  DATABASE_ERROR = 'database_error',
  AUTH_ERROR = 'authentication_error',
  TIMEOUT_ERROR = 'timeout_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  UNKNOWN = 'unknown'
}

/**
 * Error class for AI service with improved error handling
 */
export class AIServiceError extends Error {
  type: AIServiceErrorType;
  statusCode?: number;
  retryable: boolean;
  
  constructor(
    message: string, 
    type: AIServiceErrorType = AIServiceErrorType.UNKNOWN, 
    statusCode?: number,
    retryable = false
  ) {
    super(message);
    this.type = type;
    this.name = 'AIServiceError';
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/**
 * Interface for workflow node state changes
 */
interface AINodeStateChanges {
  prompt?: string;
  aiProvider?: string;
  modelName?: string;
  systemMessage?: string;
  lastResponse?: string;
  lastResponseTime?: string;
  processingStatus?: 'idle' | 'running' | 'completed' | 'failed';
  error?: string;
  [key: string]: any;
}

/**
 * Logger utility for consistent logging
 */
const logger = {
  info: (message: string, data?: any) => {
    console.info(`[AIService] ${message}`, data || '');
  },
  error: (message: string, error: any) => {
    console.error(`[AIService] ERROR: ${message}`, error);
  },
  warn: (message: string, data?: any) => {
    console.warn(`[AIService] WARNING: ${message}`, data || '');
  }
};

/**
 * Utility function for retrying operations with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    operationName?: string;
    shouldRetry?: (error: any, attempt: number) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = MAX_RETRIES,
    initialDelay = RETRY_DELAY_MS,
    operationName = 'operation',
    shouldRetry = (error) => error.retryable === true
  } = options;
  
  let delay = initialDelay;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout to prevent hanging operations
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new AIServiceError(
          `${operationName} timed out after ${TIMEOUT_MS}ms`,
          AIServiceErrorType.TIMEOUT_ERROR,
          408,
          true
        )), TIMEOUT_MS);
      });
      
      // Race the operation against the timeout
      return await Promise.race([operation(), timeoutPromise]);
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this error
      if (!shouldRetry(error, attempt) || attempt >= maxRetries) {
        break;
      }
      
      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} for ${operationName} after error: ${error.message}`);
      
      // Wait before retrying with exponential backoff and jitter
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = delay * 1.5 + Math.random() * 300;
    }
  }
  
  throw lastError || new AIServiceError(`Max retries (${maxRetries}) exceeded`, AIServiceErrorType.UNKNOWN);
}

/**
 * Improved function to update an AI node's state in a workflow
 */
export async function updateAINodeState(
  workflowId: string, 
  nodeId: string, 
  changes: AINodeStateChanges
): Promise<{ success: boolean; error?: any }> {
  if (!workflowId || !nodeId) {
    logger.error('Missing required parameters', { workflowId, nodeId });
    return { success: false, error: 'Missing required parameters' };
  }
  
  try {
    logger.info(`Updating AI node state: ${nodeId} in workflow: ${workflowId}`);
    
    // Get the current workflow definition
    const { data: workflow, error: fetchError } = await supabase
      .from('workflows')
      .select('definition')
      .eq('id', workflowId)
      .single();
    
    if (fetchError) {
      logger.error('Error fetching workflow', fetchError);
      return { 
        success: false, 
        error: new AIServiceError(
          `Error fetching workflow: ${fetchError.message}`, 
          AIServiceErrorType.DATABASE_ERROR
        )
      };
    }
    
    if (!workflow) {
      return { 
        success: false, 
        error: new AIServiceError('Workflow not found', AIServiceErrorType.DATABASE_ERROR, 404)
      };
    }
    
    // Parse the definition safely
    let definition;
    try {
      definition = typeof workflow.definition === 'string' 
        ? JSON.parse(workflow.definition) 
        : workflow.definition;
    } catch (parseError) {
      logger.error('Error parsing workflow definition', parseError);
      return { 
        success: false, 
        error: new AIServiceError(
          `Invalid workflow definition: ${parseError.message}`, 
          AIServiceErrorType.DATABASE_ERROR
        )
      };
    }
    
    // Find and update the node
    let nodeUpdated = false;
    
    if (definition.nodes && Array.isArray(definition.nodes)) {
      for (let i = 0; i < definition.nodes.length; i++) {
        if (definition.nodes[i].id === nodeId) {
          // Ensure data and config objects exist
          if (!definition.nodes[i].data) {
            definition.nodes[i].data = {};
          }
          
          if (!definition.nodes[i].data.config) {
            definition.nodes[i].data.config = {};
          }
          
          // Update the node configuration
          definition.nodes[i].data = {
            ...definition.nodes[i].data,
            config: {
              ...definition.nodes[i].data.config,
              ...changes,
              // Always update the last modified timestamp
              lastModified: new Date().toISOString()
            }
          };
          nodeUpdated = true;
          break;
        }
      }
    }
    
    if (!nodeUpdated) {
      return { 
        success: false, 
        error: new AIServiceError('Node not found in workflow', AIServiceErrorType.DATABASE_ERROR, 404)
      };
    }
    
    // Update the workflow with transaction for better reliability
    const { error: updateError } = await supabase
      .from('workflows')
      .update({
        definition: JSON.stringify(definition),
        updated_at: new Date().toISOString()
      })
      .eq('id', workflowId);
    
    if (updateError) {
      logger.error('Error updating workflow', updateError);
      return { 
        success: false, 
        error: new AIServiceError(
          `Failed to update workflow: ${updateError.message}`, 
          AIServiceErrorType.DATABASE_ERROR
        )
      };
    }
    
    logger.info(`Successfully updated AI node state for ${nodeId}`);
    return { success: true };
    
  } catch (error) {
    logger.error('Error in updateAINodeState', error);
    return { 
      success: false, 
      error: new AIServiceError(
        `Unexpected error: ${error.message}`, 
        AIServiceErrorType.UNKNOWN
      )
    };
  }
}

/**
 * Helper function to securely get authentication token
 */
async function getAuthToken(): Promise<string> {
  try {
    const { data, error } = await supabase.auth.getSession();
    
    if (error || !data?.session?.access_token) {
      throw new AIServiceError(
        'Failed to get authentication token', 
        AIServiceErrorType.AUTH_ERROR
      );
    }
    
    return data.session.access_token;
  } catch (error) {
    logger.error('Error getting auth token', error);
    throw new AIServiceError(
      `Authentication error: ${error.message}`, 
      AIServiceErrorType.AUTH_ERROR
    );
  }
}

/**
 * Improved function to trigger an AI response from a workflow node
 */
export async function triggerAIResponse(
  workflowId: string,
  nodeId: string,
  executionId: string,
  query: string,
  provider: 'openai' | 'anthropic' | 'deepseek',
  modelName: string,
  systemMessage?: string
): Promise<{ success: boolean; requestId?: string; error?: any; message?: string }> {
  try {
    logger.info(`Triggering AI response for node ${nodeId} in workflow ${workflowId}`);
    
    if (!workflowId || !nodeId || !executionId || !query) {
      return { 
        success: false, 
        error: new AIServiceError('Missing required parameters', AIServiceErrorType.UNKNOWN, 400)
      };
    }
    
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
    
    // Get auth token for API request
    const authToken = await getAuthToken();
    
    // Make API request with retries for better reliability
    const response = await withRetry(
      async () => {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/workflow_ai_requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY || '',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(requestData)
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new AIServiceError(
            `Failed to create AI request: ${res.status} - ${errorText}`,
            AIServiceErrorType.DATABASE_ERROR,
            res.status,
            res.status === 429 || res.status >= 500 // Only retry for rate limiting or server errors
          );
        }
        
        return res;
      },
      {
        operationName: 'create_ai_request',
        shouldRetry: (error) => error.retryable === true
      }
    );
    
    // Update the node state to indicate it's processing
    await updateAINodeState(workflowId, nodeId, {
      lastResponseTime: new Date().toISOString(),
      processingStatus: 'running'
    });
    
    logger.info(`AI request created successfully: ${requestId}`);
    
    // Return the request ID so the client can poll for updates
    return {
      success: true,
      requestId: requestId,
      message: 'AI request created and is being processed'
    };
    
  } catch (error) {
    logger.error('Error in triggerAIResponse', error);
    
    // Show user-friendly error message
    if (error instanceof AIServiceError) {
      toast.error(error.type === AIServiceErrorType.NETWORK_ERROR ? 
        'Network error. Please check your connection and try again.' :
        'Failed to trigger AI response. Please try again later.'
      );
    } else {
      toast.error('Failed to trigger AI response');
    }
    
    return { success: false, error };
  }
}

/**
 * Improved function to check the status of an AI request with retries and better error handling
 */
export async function checkAIRequestStatus(requestId: string): Promise<{
  success: boolean;
  status?: AIRequestStatus;
  response?: string;
  error?: any;
  tokenUsage?: any;
  completedAt?: string;
}> {
  if (!requestId) {
    return { 
      success: false, 
      error: new AIServiceError('Missing request ID', AIServiceErrorType.UNKNOWN, 400)
    };
  }
  
  try {
    logger.info(`Checking status of AI request: ${requestId}`);
    
    // Get auth token for API request
    const authToken = await getAuthToken();
    
    // Make API request with retries
    const response = await withRetry(
      async () => {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/workflow_ai_requests?id=eq.${requestId}&select=*`, 
          {
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY || '',
              'Authorization': `Bearer ${authToken}`
            }
          }
        );
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new AIServiceError(
            `Failed to check AI request status: ${res.status} - ${errorText}`,
            AIServiceErrorType.DATABASE_ERROR,
            res.status,
            res.status === 429 || res.status >= 500 // Only retry for rate limiting or server errors
          );
        }
        
        const data = await res.json();
        return data;
      },
      {
        operationName: 'check_ai_request_status',
        shouldRetry: (error) => error.retryable === true
      }
    );
    
    if (!response || response.length === 0) {
      return { 
        success: false, 
        error: new AIServiceError('AI request not found', AIServiceErrorType.UNKNOWN, 404)
      };
    }
    
    const aiRequest = response[0];
    
    logger.info(`AI request status: ${aiRequest.status}`);
    
    return {
      success: true,
      status: aiRequest.status,
      response: aiRequest.ai_response,
      error: aiRequest.error_message,
      tokenUsage: aiRequest.token_usage,
      completedAt: aiRequest.completed_at
    };
    
  } catch (error) {
    logger.error('Error in checkAIRequestStatus', error);
    return { success: false, error };
  }
}

/**
 * Function to ask AI with improved error handling and validation
 */
export async function askAI(
  workflowId: string, 
  nodeId: string, 
  query: string, 
  provider: string, 
  model: string,
  systemMessage?: string
) {
  if (!workflowId || !nodeId || !query || !provider || !model) {
    throw new AIServiceError('Missing required parameters', AIServiceErrorType.UNKNOWN, 400);
  }
  
  // Validate provider
  const validProviders = ['openai', 'anthropic', 'deepseek'];
  if (!validProviders.includes(provider)) {
    throw new AIServiceError(
      `Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`,
      AIServiceErrorType.UNKNOWN,
      400
    );
  }
  
  // Generate an execution ID
  const executionId = uuidv4();
  
  // Log the request
  logger.info(`Asking AI: ${provider}/${model}`, { 
    workflowId, 
    nodeId, 
    queryLength: query.length,
    executionId
  });
  
  return triggerAIResponse(
    workflowId, 
    nodeId, 
    executionId, 
    query, 
    provider as 'openai' | 'anthropic' | 'deepseek', 
    model,
    systemMessage
  );
}

/**
 * Function to get node AI requests with improved pagination and filtering
 */
export async function getNodeAIRequests(
  workflowId: string, 
  nodeId: string,
  options: {
    limit?: number;
    offset?: number;
    status?: AIRequestStatus;
    sortBy?: 'created_at' | 'completed_at';
    sortDirection?: 'asc' | 'desc';
  } = {}
) {
  const {
    limit = 10,
    offset = 0,
    status,
    sortBy = 'created_at',
    sortDirection = 'desc'
  } = options;
  
  if (!workflowId || !nodeId) {
    return { 
      success: false, 
      error: new AIServiceError('Missing required parameters', AIServiceErrorType.UNKNOWN, 400)
    };
  }
  
  try {
    logger.info(`Getting AI requests for node ${nodeId} in workflow ${workflowId}`);
    
    // Build the query URL with all filters
    let url = `${SUPABASE_URL}/rest/v1/workflow_ai_requests?workflow_id=eq.${workflowId}&node_id=eq.${nodeId}`;
    
    // Add status filter if provided
    if (status) {
      url += `&status=eq.${status}`;
    }
    
    // Add sorting, pagination and selection
    url += `&select=*&order=${sortBy}.${sortDirection}&limit=${limit}&offset=${offset}`;
    
    // Get auth token for API request
    const authToken = await getAuthToken();
    
    // Make the API request with retries
    const response = await withRetry(
      async () => {
        const res = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY || '',
            'Authorization': `Bearer ${authToken}`
          }
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new AIServiceError(
            `Failed to fetch AI requests: ${res.status} - ${errorText}`,
            AIServiceErrorType.DATABASE_ERROR,
            res.status,
            res.status === 429 || res.status >= 500
          );
        }
        
        const data = await res.json();
        return data;
      },
      {
        operationName: 'get_node_ai_requests',
        shouldRetry: (error) => error.retryable === true
      }
    );
    
    // Get total count of requests for pagination
    const countResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/workflow_ai_requests?workflow_id=eq.${workflowId}&node_id=eq.${nodeId}&select=count`, 
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${authToken}`,
          'Prefer': 'count=exact'
        }
      }
    );
    
    const totalCount = parseInt(countResponse.headers.get('content-range')?.split('/')[1] || '0');
    
    return { 
      success: true, 
      data: response,
      pagination: {
        total: totalCount,
        offset,
        limit
      }
    };
  } catch (error) {
    logger.error('Error in getNodeAIRequests', error);
    return { success: false, error };
  }
}

/**
 * Improved function to subscribe to AI request updates
 */
export function subscribeToAIRequest(
  requestId: string, 
  callback: (status: any) => void,
  errorCallback?: (error: any) => void
) {
  if (!requestId) {
    const error = new AIServiceError('Missing request ID', AIServiceErrorType.UNKNOWN, 400);
    if (errorCallback) {
      errorCallback(error);
    } else {
      logger.error('Invalid requestId for subscription', { requestId });
    }
    
    // Return a no-op unsubscribe function
    return () => {};
  }
  
  logger.info(`Subscribing to AI request updates: ${requestId}`);
  
  try {
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
          logger.info(`Received update for AI request: ${requestId}`, { 
            status: payload.new.status 
          });
          callback(payload.new);
        }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          const error = new AIServiceError(
            `Failed to subscribe to AI request updates: ${status}`,
            AIServiceErrorType.UNKNOWN
          );
          
          if (errorCallback) {
            errorCallback(error);
          } else {
            logger.error('Subscription error', { status, requestId });
          }
        } else {
          logger.info(`Successfully subscribed to AI request: ${requestId}`);
        }
      });
    
    // Return an unsubscribe function
    return () => {
      logger.info(`Unsubscribing from AI request: ${requestId}`);
      supabase.removeChannel(channel);
    };
  } catch (error) {
    logger.error('Error setting up subscription', error);
    
    if (errorCallback) {
      errorCallback(error);
    }
    
    // Return a no-op unsubscribe function
    return () => {};
  }
}

/**
 * New function to cancel an ongoing AI request
 */
export async function cancelAIRequest(requestId: string): Promise<{ success: boolean; error?: any }> {
  if (!requestId) {
    return { 
      success: false, 
      error: new AIServiceError('Missing request ID', AIServiceErrorType.UNKNOWN, 400)
    };
  }
  
  try {
    logger.info(`Cancelling AI request: ${requestId}`);
    
    // Get auth token for API request
    const authToken = await getAuthToken();
    
    // Update the request status to 'cancelled'
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/workflow_ai_requests?id=eq.${requestId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new AIServiceError(
        `Failed to cancel AI request: ${response.status} - ${errorText}`,
        AIServiceErrorType.DATABASE_ERROR,
        response.status
      );
    }
    
    logger.info(`Successfully cancelled AI request: ${requestId}`);
    return { success: true };
  } catch (error) {
    logger.error('Error in cancelAIRequest', error);
    return { success: false, error };
  }
}
