
import { supabase } from '@/integrations/supabase/client';

interface ProcessingConfig {
  operation: string;
  [key: string]: any;
}

interface NodeInput {
  [key: string]: any;
}

export async function executeDataProcessing(
  nodeId: string,
  workflowId: string,
  executionId: string,
  config: ProcessingConfig,
  inputs: NodeInput
) {
  try {
    console.log(`Executing data processing node ${nodeId} with operation ${config.operation}`);
    console.log('Node inputs:', inputs);
    console.log('Node configuration:', config);

    // Extract data from input
    const inputData = inputs.data || {};
    
    // Call the process-excel edge function
    const { data: responseData, error: responseError } = await supabase.functions.invoke(
      'process-excel',
      {
        body: {
          operation: config.operation,
          data: inputData,
          configuration: config,
          previousNodeOutput: inputs,
          nodeId,
          workflowId,
          executionId
        }
      }
    );

    if (responseError) {
      console.error(`Error in data processing operation ${config.operation}:`, responseError);
      throw new Error(responseError.message || `Error processing data with operation ${config.operation}`);
    }

    console.log(`Data processing operation ${config.operation} completed successfully:`, responseData);
    
    // Return the processed data and explanation
    return {
      data: responseData.result?.processedData || {},
      explanation: responseData.result?.explanation || 'Processing completed',
      operation: config.operation
    };
  } catch (error) {
    console.error(`Error executing data processing node ${nodeId}:`, error);
    throw error;
  }
}
