
import { useState, useEffect, useCallback } from 'react';
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

// Cache to store schemas by node ID
const schemaCache = new Map<string, SchemaColumn[]>();

export function useDataProcessing() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);

  // Helper function to detect data types from sample data
  const detectSchema = useCallback((data: any[]): SchemaColumn[] => {
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
  }, []);

  // Function to process data with progress tracking
  const processData = useCallback(async (
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
      console.log('Detected schema:', detectedSchema);
      setSchema(detectedSchema);
      
      // Store in cache
      if (options.nodeId) {
        schemaCache.set(options.nodeId, detectedSchema);
      }
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          const next = prev + Math.random() * 15;
          return next > 90 ? 90 : next;
        });
      }, 500);
      
      // Send data to backend processing function
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
          
          // Update cache
          if (options.nodeId) {
            schemaCache.set(options.nodeId, newSchema);
          }
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
  }, [detectSchema]);

  // Function to fetch schema from a specific node in the workflow
  const fetchNodeSchema = useCallback(async (workflowId: string, nodeId: string, forceRefresh: boolean = false): Promise<SchemaColumn[]> => {
    // Check cache first if not forcing refresh
    if (!forceRefresh && schemaCache.has(nodeId)) {
      console.log('Using cached schema for node:', nodeId);
      const cachedSchema = schemaCache.get(nodeId);
      if (cachedSchema && cachedSchema.length > 0) {
        setSchema(cachedSchema);
        return cachedSchema;
      }
    }
    
    setIsLoadingSchema(true);
    
    try {
      console.log(`Fetching schema for node ${nodeId} in workflow ${workflowId}`);
      
      // First, check for a file upload node
      const { data: fileNodeData, error: fileNodeError } = await supabase
        .from('workflow_files')
        .select('file_id')
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      if (fileNodeData && fileNodeData.file_id) {
        console.log('Found file node with file_id:', fileNodeData.file_id);
        
        // Fetch file metadata for schema
        const { data: fileMetadata, error: metadataError } = await supabase
          .from('file_metadata')
          .select('column_definitions')
          .eq('file_id', fileNodeData.file_id)
          .maybeSingle();
          
        if (metadataError) {
          console.error('Error fetching file metadata:', metadataError);
        }
        
        if (fileMetadata && fileMetadata.column_definitions) {
          const columnSchema = parseFileMetadataToSchema(fileMetadata.column_definitions);
          console.log('Parsed schema from file metadata:', columnSchema);
          setSchema(columnSchema);
          schemaCache.set(nodeId, columnSchema);
          return columnSchema;
        }
      }
      
      // Fall back to workflow executions if file metadata not available
      const { data, error } = await supabase
        .from('workflow_executions')
        .select('node_states')
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error fetching node schema from workflow executions:', error);
        return [];
      }
      
      if (data && data.length > 0 && data[0].node_states && data[0].node_states[nodeId]) {
        const nodeOutput = data[0].node_states[nodeId].output;
        
        if (nodeOutput && nodeOutput.data && Array.isArray(nodeOutput.data)) {
          const detectedSchema = detectSchema(nodeOutput.data);
          setSchema(detectedSchema);
          schemaCache.set(nodeId, detectedSchema);
          return detectedSchema;
        }
      }

      // If no direct data found, try looking at workflow step logs
      const { data: logData, error: logError } = await supabase
        .from('workflow_step_logs')
        .select('output_data')
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (logError) {
        console.error('Error fetching workflow step logs:', logError);
      } else if (logData && logData.length > 0 && logData[0].output_data) {
        const outputData = logData[0].output_data;
        let dataToCheck = outputData;
        
        // Handle different output data structures
        if (outputData.result && outputData.result.processedData) {
          dataToCheck = outputData.result.processedData;
        } else if (outputData.data) {
          dataToCheck = outputData.data;
        }
        
        if (Array.isArray(dataToCheck) && dataToCheck.length > 0) {
          const detectedSchema = detectSchema(dataToCheck);
          console.log('Detected schema from logs:', detectedSchema);
          setSchema(detectedSchema);
          schemaCache.set(nodeId, detectedSchema);
          return detectedSchema;
        }
      }
      
      console.log('No schema found for node:', nodeId);
      return [];
    } catch (err) {
      console.error('Error fetching node schema:', err);
      return [];
    } finally {
      setIsLoadingSchema(false);
    }
  }, [detectSchema]);

  // Function to parse file metadata to schema
  const parseFileMetadataToSchema = (columnDefinitions: any): SchemaColumn[] => {
    if (Array.isArray(columnDefinitions)) {
      return columnDefinitions.map(col => {
        let type: SchemaColumn['type'] = 'string';
        
        if (col.type === 'numeric' || col.type === 'integer' || col.type === 'float') {
          type = 'number';
        } else if (col.type === 'boolean') {
          type = 'boolean';
        } else if (col.type === 'date' || col.type === 'timestamp') {
          type = 'date';
        } else if (col.type === 'object') {
          type = 'object';
        } else if (col.type === 'array') {
          type = 'array';
        }
        
        return {
          name: col.name || col.header || '',
          type
        };
      });
    } else if (typeof columnDefinitions === 'object') {
      return Object.entries(columnDefinitions).map(([name, type]) => ({
        name,
        type: mapColumnType(type as string)
      }));
    }
    
    return [];
  };

  // Helper function to map column types
  const mapColumnType = (type: string): SchemaColumn['type'] => {
    if (['numeric', 'integer', 'float', 'number'].includes(type.toLowerCase())) {
      return 'number';
    } else if (['boolean', 'bool'].includes(type.toLowerCase())) {
      return 'boolean';
    } else if (['date', 'timestamp', 'datetime'].includes(type.toLowerCase())) {
      return 'date';
    } else if (type.toLowerCase() === 'object') {
      return 'object';
    } else if (type.toLowerCase() === 'array') {
      return 'array';
    }
    return 'string';
  };

  // Function to fetch schema from a previous node
  const fetchPreviousNodeSchema = useCallback(async (workflowId: string, currentNodeId: string): Promise<SchemaColumn[]> => {
    try {
      // Fetch edges to find the previous node
      const { data: workflowData, error: workflowError } = await supabase
        .from('workflows')
        .select('definition')
        .eq('id', workflowId)
        .single();
      
      if (workflowError || !workflowData) {
        console.error('Error fetching workflow definition:', workflowError);
        return [];
      }
      
      const definition = typeof workflowData.definition === 'string'
        ? JSON.parse(workflowData.definition)
        : workflowData.definition;
      
      if (!definition || !definition.edges || !Array.isArray(definition.edges)) {
        console.log('No edges found in workflow definition');
        return [];
      }
      
      // Find edges where target is the current node
      const incomingEdges = definition.edges.filter((edge: any) => 
        edge.target === currentNodeId || 
        (edge.targetHandle && edge.targetNode === currentNodeId)
      );
      
      if (incomingEdges.length === 0) {
        console.log('No incoming edges found for node:', currentNodeId);
        return [];
      }
      
      // Get the source node ID of the first incoming edge
      const previousNodeId = incomingEdges[0].source || 
        (incomingEdges[0].sourceHandle && incomingEdges[0].sourceNode);
      
      if (!previousNodeId) {
        console.log('Unable to determine previous node ID');
        return [];
      }
      
      console.log('Found previous node:', previousNodeId);
      
      // Fetch schema for the previous node
      return await fetchNodeSchema(workflowId, previousNodeId);
    } catch (err) {
      console.error('Error fetching previous node schema:', err);
      return [];
    }
  }, [fetchNodeSchema]);

  // Clear cache for specific node or workflow
  const clearSchemaCache = useCallback((nodeId?: string) => {
    if (nodeId) {
      schemaCache.delete(nodeId);
    } else {
      schemaCache.clear();
    }
  }, []);

  // Expose the schema and related functions
  return {
    processData,
    isProcessing,
    result,
    error,
    progress,
    schema,
    isLoadingSchema,
    detectSchema,
    fetchNodeSchema,
    fetchPreviousNodeSchema,
    clearSchemaCache
  };
}
