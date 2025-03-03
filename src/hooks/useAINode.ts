
import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AIRequestData } from '@/types/workflow';
import { askAI, getNodeAIRequests, subscribeToAIRequest } from '@/services/aiService';

export function useAINode(workflowId: string, nodeId: string, executionId?: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [aiRequests, setAiRequests] = useState<AIRequestData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [latestRequest, setLatestRequest] = useState<AIRequestData | null>(null);
  const { toast } = useToast();

  // Load AI requests for the node
  const loadAIRequests = useCallback(async () => {
    if (!workflowId || !nodeId) return;

    try {
      const requests = await getNodeAIRequests(workflowId, nodeId);
      setAiRequests(requests);
      
      if (requests.length > 0) {
        setLatestRequest(requests[0]);
      }
    } catch (err) {
      console.error('Error loading AI requests:', err);
      setError(err instanceof Error ? err.message : 'Failed to load AI requests');
    }
  }, [workflowId, nodeId]);

  // Submit a query to AI
  const submitQuery = useCallback(async (
    query: string, 
    provider: 'openai' | 'anthropic' | 'deepseek',
    systemMessage?: string,
    modelName?: string
  ) => {
    if (!workflowId || !nodeId || !executionId) {
      toast({
        title: "Error",
        description: "Missing workflow, node, or execution information",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await askAI({
        workflowId,
        nodeId,
        executionId,
        aiProvider: provider,
        userQuery: query,
        systemMessage,
        modelName
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to get AI response');
      }

      // Reload requests to get the latest one
      await loadAIRequests();
      
      toast({
        title: "Success",
        description: "AI response generated successfully",
      });
      
      return result.requestId;
    } catch (err) {
      console.error('Error submitting AI query:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit AI query');
      
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to get AI response',
        variant: "destructive"
      });
      
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [workflowId, nodeId, executionId, toast, loadAIRequests]);

  // Set up real-time subscription for the latest request
  useEffect(() => {
    if (!latestRequest) return undefined;
    
    const unsubscribe = subscribeToAIRequest(latestRequest.id, (updatedRequest) => {
      setLatestRequest(updatedRequest);
      
      // Also update the request in the requests list
      setAiRequests(prevRequests => 
        prevRequests.map(req => 
          req.id === updatedRequest.id ? updatedRequest : req
        )
      );
      
      if (updatedRequest.status === 'completed') {
        toast({
          title: "AI Response Updated",
          description: "The AI has completed its response",
        });
      } else if (updatedRequest.status === 'failed') {
        toast({
          title: "AI Processing Failed",
          description: updatedRequest.error_message || "The AI processing failed",
          variant: "destructive"
        });
      }
    });
    
    return unsubscribe;
  }, [latestRequest, toast]);

  // Load initial requests when the component mounts
  useEffect(() => {
    loadAIRequests();
  }, [loadAIRequests]);

  return {
    isLoading,
    aiRequests,
    latestRequest,
    error,
    submitQuery,
    refreshRequests: loadAIRequests
  };
}
