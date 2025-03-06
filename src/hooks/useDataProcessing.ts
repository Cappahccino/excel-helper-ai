
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProcessingConfig {
  operation: string;
  [key: string]: any;
}

interface ProcessingData {
  [key: string]: any;
}

interface ProcessingOptions {
  nodeId: string;
  workflowId: string;
  executionId: string;
}

export function useDataProcessing() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const processData = async (
    data: ProcessingData,
    config: ProcessingConfig,
    options: ProcessingOptions,
    previousNodeOutput?: any
  ) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const { data: responseData, error: responseError } = await supabase.functions.invoke(
        'process-excel',
        {
          body: {
            operation: config.operation,
            data,
            configuration: config,
            previousNodeOutput,
            nodeId: options.nodeId,
            workflowId: options.workflowId,
            executionId: options.executionId
          }
        }
      );

      if (responseError) {
        throw new Error(responseError.message || 'Error processing data');
      }

      setResult(responseData);
      return responseData;
    } catch (err) {
      console.error('Error in data processing:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`Data processing failed: ${errorMessage}`);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    processData,
    isProcessing,
    result,
    error
  };
}
