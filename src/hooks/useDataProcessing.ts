
import { useState, useEffect } from 'react';
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

interface SchemaColumn {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown';
}

export function useDataProcessing() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [schema, setSchema] = useState<SchemaColumn[]>([]);

  // Helper function to detect data types from sample data
  const detectSchema = (data: any[]): SchemaColumn[] => {
    if (!data || !data.length) return [];
    
    const sampleItem = data[0];
    const detectedSchema: SchemaColumn[] = [];
    
    for (const [key, value] of Object.entries(sampleItem)) {
      let type: SchemaColumn['type'] = 'unknown';
      
      if (typeof value === 'string') {
        // Try to detect if it's a date
        const dateTest = new Date(value);
        if (!isNaN(dateTest.getTime()) && value.match(/^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}/)) {
          type = 'date';
        } else {
          type = 'string';
        }
      } else if (typeof value === 'number') {
        type = 'number';
      } else if (typeof value === 'boolean') {
        type = 'boolean';
      } else if (Array.isArray(value)) {
        type = 'array';
      } else if (typeof value === 'object' && value !== null) {
        type = 'object';
      }
      
      detectedSchema.push({ name: key, type });
    }
    
    return detectedSchema;
  };

  const processData = async (
    data: ProcessingData,
    config: ProcessingConfig,
    options: ProcessingOptions,
    previousNodeOutput?: any
  ) => {
    setIsProcessing(true);
    setError(null);
    setProgress(0);
    
    try {
      // Detect schema from the data for UI configuration
      const detectedSchema = detectSchema(Array.isArray(data) ? data : [data]);
      setSchema(detectedSchema);
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          const next = prev + Math.random() * 15;
          return next > 90 ? 90 : next;
        });
      }, 500);
      
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

      clearInterval(progressInterval);
      setProgress(100);

      if (responseError) {
        throw new Error(responseError.message || 'Error processing data');
      }

      setResult(responseData);
      
      // Update schema if result data format changed
      if (responseData?.result?.processedData) {
        const processedData = responseData.result.processedData;
        if (Array.isArray(processedData) && processedData.length > 0) {
          const newSchema = detectSchema(processedData);
          setSchema(newSchema);
        }
      }
      
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

  // Expose the detected schema to consumers
  const getSchema = () => schema;

  return {
    processData,
    isProcessing,
    result,
    error,
    progress,
    schema,
    getSchema
  };
}
