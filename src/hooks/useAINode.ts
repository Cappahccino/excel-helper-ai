
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AIRequestData } from '@/types/workflow';

interface UseAINodeParams {
  workflowId: string | null;
}

interface AskAIParams {
  nodeId: string;
  executionId: string;
  prompt: string;
  aiProvider: 'openai' | 'anthropic' | 'deepseek';
  systemMessage?: string;
  modelName?: string;
}

interface AINodeResponse {
  success: boolean;
  aiResponse?: string;
  error?: string;
  requestId?: string;
  tokenUsage?: Record<string, number>;
}

export const useAINode = ({ workflowId }: UseAINodeParams) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiRequests, setAIRequests] = useState<AIRequestData[]>([]);

  const askAI = async ({
    nodeId,
    executionId,
    prompt,
    aiProvider,
    systemMessage,
    modelName
  }: AskAIParams): Promise<AINodeResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      if (!workflowId) {
        throw new Error('Workflow ID is required');
      }

      const response = await supabase.functions.invoke('ask-ai', {
        body: {
          workflowId,
          nodeId,
          executionId,
          aiProvider,
          userQuery: prompt,
          systemMessage,
          modelName
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to invoke AI function');
      }

      // Extract data from the response
      const { success, aiResponse, error: responseError, requestId, tokenUsage } = response.data;

      if (!success || responseError) {
        throw new Error(responseError || 'Failed to get response from AI');
      }

      // Load the latest AI requests after successful operation
      loadAIRequests();

      return { 
        success: true, 
        aiResponse, 
        requestId,
        tokenUsage
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`AI request failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const loadAIRequests = async () => {
    try {
      if (!workflowId) return;

      const { data, error } = await supabase
        .from('workflow_ai_requests')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setAIRequests(data || []);
    } catch (err) {
      console.error('Error loading AI requests:', err);
      setError(err instanceof Error ? err.message : 'Failed to load AI requests');
    }
  };

  // Function to get AI request data for a specific node
  const getNodeAIRequests = (nodeId: string) => {
    return aiRequests.filter(request => request.node_id === nodeId);
  };

  // Function to get the most recent AI request for a node
  const getLatestNodeRequest = (nodeId: string) => {
    const nodeRequests = getNodeAIRequests(nodeId);
    return nodeRequests.length > 0 ? nodeRequests[0] : null;
  };

  return {
    askAI,
    loadAIRequests,
    getNodeAIRequests,
    getLatestNodeRequest,
    aiRequests,
    isLoading,
    error
  };
};
