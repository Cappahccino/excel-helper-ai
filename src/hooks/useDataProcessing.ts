
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

// Export the SchemaColumn type so it can be imported in other files
export interface SchemaColumn {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown';
}

const schemaCache = new Map<string, SchemaColumn[]>();
const previewDataCache = new Map<string, {
  data: any[],
  timestamp: number,
  columns: string[]
}>();

export function useDataProcessing() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const detectSchema = useCallback((data: any[]): SchemaColumn[] => {
    if (!data || !data.length) return [];
    
    const sampleItem = data[0];
    const detectedSchema: SchemaColumn[] = [];
    
    for (const [key, value] of Object.entries(sampleItem)) {
      let type: SchemaColumn['type'] = 'unknown';
      
      if (typeof value === 'string') {
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
      const detectedSchema = detectSchema(Array.isArray(data) ? data : [data]);
      console.log('Detected schema:', detectedSchema);
      setSchema(detectedSchema);
      
      if (options.nodeId) {
        schemaCache.set(options.nodeId, detectedSchema);
      }
      
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
      
      if (responseData?.result?.processedData) {
        const processedData = responseData.result.processedData;
        if (Array.isArray(processedData) && processedData.length > 0) {
          const newSchema = detectSchema(processedData);
          setSchema(newSchema);
          
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

  const fetchNodePreviewData = useCallback(async (
    workflowId: string, 
    nodeId: string, 
    config: any,
    options?: { 
      forceRefresh?: boolean, 
      maxRows?: number,
      applyTransformation?: boolean 
    }
  ): Promise<{data: any[], columns: string[]}> => {
    const opts = {
      forceRefresh: false,
      maxRows: 10,
      applyTransformation: true,
      ...options
    };
    
    const cacheKey = `${workflowId}-${nodeId}`;
    if (!opts.forceRefresh && previewDataCache.has(cacheKey)) {
      const cachedData = previewDataCache.get(cacheKey);
      if (cachedData && Date.now() - cachedData.timestamp < 5 * 60 * 1000) {
        console.log('Using cached preview data for node:', nodeId);
        return { data: cachedData.data, columns: cachedData.columns };
      }
    }
    
    setIsLoadingPreview(true);
    setPreviewError(null);
    
    try {
      console.log(`Fetching preview data for node ${nodeId} in workflow ${workflowId}`);
      
      const { data: fileNodeData, error: fileNodeError } = await supabase
        .from('workflow_files')
        .select('file_id')
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      if (fileNodeError) {
        throw new Error(`Error fetching file node data: ${fileNodeError.message}`);
      }
      
      let previewResult: { data: any[], columns: string[] } = { data: [], columns: [] };
      
      if (fileNodeData && fileNodeData.file_id) {
        const { data: filePreview, error: previewError } = await supabase.functions.invoke('preview-file-data', {
          body: { 
            fileId: fileNodeData.file_id,
            maxRows: opts.maxRows
          }
        });
        
        if (previewError) {
          throw new Error(`Error fetching file preview: ${previewError.message}`);
        }
        
        if (filePreview && filePreview.data) {
          previewResult = {
            data: filePreview.data,
            columns: filePreview.columns || Object.keys(filePreview.data[0] || {})
          };
        }
      } else {
        const { data: schemaData, error: schemaError } = await supabase
          .from('workflow_file_schemas')
          .select('*')
          .eq('workflow_id', workflowId)
          .eq('node_id', nodeId)
          .maybeSingle();
          
        if (schemaError) {
          throw new Error(`Error fetching node schema: ${schemaError.message}`);
        }
        
        if (!schemaData) {
          throw new Error('No schema found for this node');
        }
        
        const { data: edgeData, error: edgeError } = await supabase
          .from('workflow_edges')
          .select('source_node_id')
          .eq('workflow_id', workflowId)
          .eq('target_node_id', nodeId)
          .maybeSingle();
          
        if (edgeError) {
          throw new Error(`Error fetching edge data: ${edgeError.message}`);
        }
        
        if (!edgeData || !edgeData.source_node_id) {
          throw new Error('No source node found for this node');
        }
        
        const sourcePreview = await fetchNodePreviewData(
          workflowId, 
          edgeData.source_node_id,
          null,
          { maxRows: opts.maxRows * 2, forceRefresh: opts.forceRefresh, applyTransformation: false }
        );
        
        if (sourcePreview.data.length === 0) {
          return { data: [], columns: [] };
        }
        
        if (opts.applyTransformation && config) {
          const { data: processedPreview, error: processError } = await supabase.functions.invoke('process-excel', {
            body: {
              previewMode: true,
              data: sourcePreview.data,
              configuration: config,
              nodeId,
              workflowId,
              maxRows: opts.maxRows
            }
          });
          
          if (processError) {
            throw new Error(`Error processing preview data: ${processError.message}`);
          }
          
          if (processedPreview && processedPreview.result && processedPreview.result.processedData) {
            previewResult = {
              data: processedPreview.result.processedData.slice(0, opts.maxRows),
              columns: processedPreview.result.columns || Object.keys(processedPreview.result.processedData[0] || {})
            };
          }
        } else {
          previewResult = sourcePreview;
        }
      }
      
      previewDataCache.set(cacheKey, {
        data: previewResult.data,
        columns: previewResult.columns,
        timestamp: Date.now()
      });
      
      setPreviewData(previewResult.data);
      setPreviewColumns(previewResult.columns);
      
      return previewResult;
    } catch (err) {
      console.error('Error fetching preview data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setPreviewError(errorMessage);
      throw err;
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  const validateNodeConfig = useCallback((
    config: any, 
    schema: SchemaColumn[]
  ): { isValid: boolean, errors: string[] } => {
    const errors: string[] = [];
    
    if (!config) {
      return { isValid: true, errors: [] };
    }
    
    if (config.column) {
      const columnExists = schema.some(col => col.name === config.column);
      if (!columnExists) {
        errors.push(`Column "${config.column}" does not exist in the dataset`);
      } else {
        const column = schema.find(col => col.name === config.column);
        
        if (config.operator && column) {
          const numericOperators = ['greater-than', 'less-than', 'between'];
          const stringOperators = ['contains', 'starts-with', 'ends-with'];
          
          if (column.type === 'number' && stringOperators.includes(config.operator)) {
            errors.push(`Operator "${config.operator}" cannot be used with numeric column "${config.column}"`);
          }
          
          if (column.type === 'string' && numericOperators.includes(config.operator)) {
            errors.push(`Operator "${config.operator}" cannot be used with text column "${config.column}"`);
          }
          
          if (config.value) {
            if (column.type === 'number' && isNaN(Number(config.value)) && config.operator !== 'equals') {
              errors.push(`Value "${config.value}" is not a valid number for column "${config.column}"`);
            }
            
            if (column.type === 'date' && isNaN(Date.parse(config.value)) && ['before', 'after', 'between'].includes(config.operator)) {
              errors.push(`Value "${config.value}" is not a valid date for column "${config.column}"`);
            }
          }
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }, []);

  const fetchNodeSchema = useCallback(async (workflowId: string, nodeId: string, forceRefresh: boolean = false): Promise<SchemaColumn[]> => {
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
      
      const { data: fileNodeData, error: fileNodeError } = await supabase
        .from('workflow_files')
        .select('file_id')
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      if (fileNodeData && fileNodeData.file_id) {
        console.log('Found file node with file_id:', fileNodeData.file_id);
        
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
      
      const { data: logData, error: logError } = await supabase
        .from('workflow_step_logs')
        .select('output_data')
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (logError) {
        console.error('Error fetching workflow step logs:', logError);
      } else if (logData && logData.length > 0) {
        const outputData = logData[0].output_data;
        
        if (outputData) {
          let dataToCheck: any[] = [];
          
          if (typeof outputData === 'object' && outputData !== null) {
            if ('result' in outputData && typeof outputData.result === 'object' && outputData.result !== null) {
              if ('processedData' in outputData.result && Array.isArray(outputData.result.processedData)) {
                dataToCheck = outputData.result.processedData;
              }
            } else if ('data' in outputData && Array.isArray(outputData.data)) {
              dataToCheck = outputData.data;
            }
          }
          
          if (dataToCheck.length > 0) {
            const detectedSchema = detectSchema(dataToCheck);
            console.log('Detected schema from logs:', detectedSchema);
            setSchema(detectedSchema);
            schemaCache.set(nodeId, detectedSchema);
            return detectedSchema;
          }
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

  const fetchPreviousNodeSchema = useCallback(async (workflowId: string, currentNodeId: string): Promise<SchemaColumn[]> => {
    try {
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
      
      const incomingEdges = definition.edges.filter((edge: any) => 
        edge.target === currentNodeId || 
        (edge.targetHandle && edge.targetNode === currentNodeId)
      );
      
      if (incomingEdges.length === 0) {
        console.log('No incoming edges found for node:', currentNodeId);
        return [];
      }
      
      const previousNodeId = incomingEdges[0].source || 
        (incomingEdges[0].sourceHandle && incomingEdges[0].sourceNode);
      
      if (!previousNodeId) {
        console.log('Unable to determine previous node ID');
        return [];
      }
      
      console.log('Found previous node:', previousNodeId);
      
      return await fetchNodeSchema(workflowId, previousNodeId);
    } catch (err) {
      console.error('Error fetching previous node schema:', err);
      return [];
    }
  }, [fetchNodeSchema]);

  const clearSchemaCache = useCallback((nodeId?: string) => {
    if (nodeId) {
      schemaCache.delete(nodeId);
    } else {
      schemaCache.clear();
    }
  }, []);

  const clearPreviewDataCache = useCallback((nodeId?: string) => {
    if (nodeId) {
      const keysToDelete: string[] = [];
      previewDataCache.forEach((_, key) => {
        if (key.includes(nodeId)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => previewDataCache.delete(key));
    } else {
      previewDataCache.clear();
    }
  }, []);

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
    clearSchemaCache,
    fetchNodePreviewData,
    previewData,
    previewColumns,
    isLoadingPreview,
    previewError,
    clearPreviewDataCache,
    validateNodeConfig
  };
}
