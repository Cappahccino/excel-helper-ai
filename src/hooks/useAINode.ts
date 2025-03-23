
import { useState, useEffect, useCallback } from 'react';
import { askAI, getNodeAIRequests, subscribeToAIRequest } from '@/services/aiService';

export function useAINode(workflowId: string, nodeId: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  const sendQuery = useCallback(async (
    query: string, 
    provider: 'openai' | 'anthropic' | 'deepseek', 
    model: string
  ) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await askAI(workflowId, nodeId, query, provider, model);
      
      if (!result.success) {
        throw new Error(result.error as string);
      }
      
      // Set up a subscription to receive updates
      const requestId = result.requestId;
      
      const unsubscribe = subscribeToAIRequest(requestId, (data) => {
        if (data.status === 'completed') {
          setResponse(data.ai_response);
          setIsLoading(false);
          unsubscribe();
        } else if (data.status === 'failed') {
          setError(new Error(data.error_message || 'AI request failed'));
          setIsLoading(false);
          unsubscribe();
        }
      });
      
      // Poll for status in case subscription doesn't work
      const checkStatus = async () => {
        // Update to use import.meta.env instead of process.env
        const statusResult = await fetch(`${import.meta.env.SUPABASE_URL}/rest/v1/workflow_ai_requests?id=eq.${requestId}&select=*`, {
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.SUPABASE_ANON_KEY || '',
            'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
          }
        }).then(r => r.json());
        
        if (statusResult && statusResult.length > 0) {
          const status = statusResult[0];
          
          if (status.status === 'completed') {
            setResponse(status.ai_response);
            setIsLoading(false);
          } else if (status.status === 'failed') {
            setError(new Error(status.error_message || 'AI request failed'));
            setIsLoading(false);
          } else if (status.status === 'pending' || status.status === 'processing') {
            // Continue polling
            setTimeout(checkStatus, 2000);
          }
        }
      };
      
      // Start polling after a short delay
      setTimeout(checkStatus, 2000);
      
      return result;
    } catch (err) {
      setError(err as Error);
      setIsLoading(false);
      return { success: false, error: err };
    }
  }, [workflowId, nodeId]);
  
  return {
    isLoading,
    response,
    error,
    sendQuery
  };
}
