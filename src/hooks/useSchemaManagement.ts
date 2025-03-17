import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { supabase } from '@/integrations/supabase/client';

/**
 * Schema cache entry with metadata
 */
export interface SchemaCacheEntry {
  schema: SchemaColumn[];
  timestamp: number;
  source: 'db' | 'propagation' | 'manual';
  sheetName?: string; // Add sheet name to cache to properly handle multi-sheet files
}

/**
 * Schema validation error
 */
export interface SchemaValidationError {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
}

/**
 * Custom hook for managing schema across nodes
 */
export function useSchemaManagement() {
  const [schemaCache, setSchemaCache] = useState<Record<string, SchemaCacheEntry>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, SchemaValidationError[]>>({});
  const [extractionStatus, setExtractionStatus] = useState<Record<string, {
    status: 'idle' | 'pending' | 'success' | 'error';
    lastAttempt: number;
    retryCount: number;
  }>>({});

  // Create a unique cache key that includes both nodeId and sheetName
  const getCacheKey = useCallback((nodeId: string, sheetName?: string): string => {
    return sheetName ? `${nodeId}:${sheetName}` : nodeId;
  }, []);

  const isTextType = (type: string): boolean => {
    return type === 'string' || type === 'text';
  };

  /**
   * Fetch schema from the database for a specific node
   */
  const fetchSchemaFromDb = useCallback(async (workflowId: string, nodeId: string, sheetName?: string): Promise<SchemaColumn[] | null> => {
    const cacheKey = getCacheKey(nodeId, sheetName);
    setIsLoading(prev => ({ ...prev, [cacheKey]: true }));
    
    try {
      console.log(`Fetching schema from DB for node ${nodeId} in workflow ${workflowId}${sheetName ? `, sheet ${sheetName}` : ''}`);
      
      const query = supabase
        .from('workflow_file_schemas')
        .select('columns, data_types, file_id')
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId);
        
      // Add sheet filter if provided
      if (sheetName) {
        query.eq('sheet_name', sheetName);
      }
      
      const { data, error } = await query.maybeSingle();
      
      if (error) {
        console.error('Error fetching schema:', error);
        setValidationErrors(prev => ({
          ...prev,
          [cacheKey]: [{ code: 'fetch_error', message: `Failed to fetch schema: ${error.message}` }]
        }));
        return null;
      }
      
      if (!data) {
        console.log(`No schema found for node ${nodeId}${sheetName ? ` and sheet ${sheetName}` : ''}`);
        return null;
      }
      
      console.log(`Found schema data for node ${nodeId}:`, data);
      
      // Convert to SchemaColumn format
      const schema: SchemaColumn[] = data.columns.map(column => {
        return {
          name: column,
          type: data.data_types[column] || 'unknown'
        };
      });
      
      // Update cache with sheet name
      setSchemaCache(prev => ({
        ...prev,
        [cacheKey]: {
          schema,
          timestamp: Date.now(),
          source: 'db',
          sheetName
        }
      }));
      
      return schema;
    } catch (err) {
      console.error('Error in fetchSchemaFromDb:', err);
      toast.error('Failed to load schema information');
      return null;
    } finally {
      setIsLoading(prev => ({ ...prev, [cacheKey]: false }));
    }
  }, [getCacheKey]);

  /**
   * Get schema for a node, either from cache or from DB
   */
  const getNodeSchema = useCallback(async (
    workflowId: string, 
    nodeId: string, 
    options?: { 
      forceRefresh?: boolean,
      maxCacheAge?: number,
      sheetName?: string
    }
  ): Promise<SchemaColumn[]> => {
    const { forceRefresh = false, maxCacheAge = 5 * 60 * 1000, sheetName } = options || {};
    const cacheKey = getCacheKey(nodeId, sheetName);
    
    // Check cache first unless force refresh is requested
    if (!forceRefresh && schemaCache[cacheKey]) {
      const cacheEntry = schemaCache[cacheKey];
      const cacheAge = Date.now() - cacheEntry.timestamp;
      
      if (cacheAge < maxCacheAge) {
        console.log(`Using cached schema for node ${nodeId}${sheetName ? `, sheet ${sheetName}` : ''}, age: ${cacheAge}ms`);
        return cacheEntry.schema;
      }
    }
    
    // Otherwise fetch from database
    console.log(`Fetching fresh schema for node ${nodeId} (forceRefresh: ${forceRefresh})${sheetName ? `, sheet ${sheetName}` : ''}`);
    const schema = await fetchSchemaFromDb(workflowId, nodeId, sheetName);
    return schema || [];
  }, [fetchSchemaFromDb, schemaCache, getCacheKey]);

  /**
   * Update schema for a node in both cache and DB
   */
  const updateNodeSchema = useCallback(async (
    workflowId: string,
    nodeId: string,
    schema: SchemaColumn[],
    options?: {
      updateDb?: boolean,
      source?: 'db' | 'propagation' | 'manual',
      fileId?: string,
      sheetName?: string
    }
  ): Promise<boolean> => {
    const { updateDb = true, source = 'manual', fileId, sheetName = 'Sheet1' } = options || {};
    const cacheKey = getCacheKey(nodeId, sheetName);
    
    try {
      // Update local cache
      setSchemaCache(prev => ({
        ...prev,
        [cacheKey]: {
          schema,
          timestamp: Date.now(),
          source,
          sheetName
        }
      }));
      
      // Clear any validation errors
      setValidationErrors(prev => {
        const { [cacheKey]: _, ...rest } = prev;
        return rest;
      });
      
      // Update database if requested
      if (updateDb) {
        const fileIdToUse = fileId || '00000000-0000-0000-0000-000000000000'; // Placeholder UUID
        
        const columns = schema.map(col => col.name);
        const dataTypes = schema.reduce((acc, col) => {
          acc[col.name] = col.type;
          return acc;
        }, {} as Record<string, string>);
        
        // Include the required file_id field and sheet_name
        const { error } = await supabase
          .from('workflow_file_schemas')
          .upsert({
            workflow_id: workflowId,
            node_id: nodeId,
            columns,
            data_types: dataTypes,
            file_id: fileIdToUse,
            sheet_name: sheetName,
            has_headers: true,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'workflow_id,node_id,sheet_name'
          });
          
        if (error) {
          console.error('Error updating schema in DB:', error);
          toast.error('Failed to save schema information');
          return false;
        }
      }
      
      console.log(`Schema for node ${nodeId}, sheet ${sheetName} updated successfully`);
      return true;
    } catch (err) {
      console.error('Error in updateNodeSchema:', err);
      toast.error('Failed to update schema');
      return false;
    }
  }, [getCacheKey]);

  /**
   * Fetch and propagate schema from source node to target node
   */
  const fetchAndPropagateSchema = useCallback(async (
    workflowId: string,
    sourceNodeId: string,
    targetNodeId: string,
    sheetName?: string
  ): Promise<boolean> => {
    const sourceCacheKey = getCacheKey(sourceNodeId, sheetName);
    const targetCacheKey = getCacheKey(targetNodeId, sheetName);
    
    setIsLoading(prev => ({ ...prev, [targetCacheKey]: true }));
    
    try {
      // First, try to get the schema from cache
      let sourceSchema = schemaCache[sourceCacheKey]?.schema;
      
      // If not in cache, fetch from DB with specific sheet if provided
      if (!sourceSchema || sourceSchema.length === 0) {
        sourceSchema = await fetchSchemaFromDb(workflowId, sourceNodeId, sheetName);
      }
      
      if (!sourceSchema || sourceSchema.length === 0) {
        // If still no schema, check for file data
        const { data: fileData } = await supabase
          .from('workflow_files')
          .select('file_id, metadata')
          .eq('workflow_id', workflowId)
          .eq('node_id', sourceNodeId)
          .maybeSingle();
          
        if (fileData?.file_id) {
          console.log(`Fetching schema from file ${fileData.file_id} for node ${sourceNodeId}`);
          
          // Get the sheet name from metadata if not provided
          const effectiveSheetName = sheetName || 
            (fileData.metadata && typeof fileData.metadata === 'object' ? 
              (fileData.metadata as any).selected_sheet : 'Sheet1');
          
          setExtractionStatus(prev => ({
            ...prev,
            [sourceNodeId]: {
              status: 'pending',
              lastAttempt: Date.now(),
              retryCount: (prev[sourceNodeId]?.retryCount || 0) + 1
            }
          }));
          
          // Trigger file schema extraction if needed
          try {
            await supabase.functions.invoke('processFile', {
              body: { 
                fileId: fileData.file_id, 
                nodeId: sourceNodeId, 
                workflowId,
                requestedSheetName: effectiveSheetName
              }
            });
          } catch (err) {
            console.error('Error invoking schema extraction:', err);
          }
          
          // Wait a bit for schema extraction to complete
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Try fetching again after extraction
          sourceSchema = await fetchSchemaFromDb(workflowId, sourceNodeId, effectiveSheetName);
          
          if (sourceSchema && sourceSchema.length > 0) {
            setExtractionStatus(prev => ({
              ...prev,
              [sourceNodeId]: {
                status: 'success',
                lastAttempt: Date.now(),
                retryCount: 0
              }
            }));
          } else {
            setExtractionStatus(prev => ({
              ...prev,
              [sourceNodeId]: {
                status: 'error',
                lastAttempt: Date.now(),
                retryCount: (prev[sourceNodeId]?.retryCount || 0)
              }
            }));
          }
        }
      }
      
      if (!sourceSchema || sourceSchema.length === 0) {
        setValidationErrors(prev => ({
          ...prev,
          [targetCacheKey]: [{ 
            code: 'source_schema_missing', 
            message: 'Source node does not have a valid schema' 
          }]
        }));
        
        toast.error("Unable to load schema from source node", { id: "schema-error" });
        return false;
      }
      
      // Update target schema with the same sheet name
      const effectiveSheetName = sheetName || 'Sheet1';
      const result = await updateNodeSchema(workflowId, targetNodeId, sourceSchema, {
        updateDb: true,
        source: 'propagation',
        sheetName: effectiveSheetName
      });
      
      if (result) {
        toast.success("Schema propagated successfully", { id: "schema-success" });
      }
      
      return result;
    } catch (err) {
      console.error('Error in fetchAndPropagateSchema:', err);
      toast.error('Failed to propagate schema between nodes');
      return false;
    } finally {
      setIsLoading(prev => ({ ...prev, [targetCacheKey]: false }));
    }
  }, [fetchSchemaFromDb, schemaCache, updateNodeSchema, getCacheKey]);

  /**
   * Propagate schema from source node to target node with transform function
   */
  const propagateSchema = useCallback(async (
    workflowId: string,
    sourceNodeId: string,
    targetNodeId: string,
    transform?: (schema: SchemaColumn[]) => SchemaColumn[],
    sheetName?: string
  ): Promise<boolean> => {
    const targetCacheKey = getCacheKey(targetNodeId, sheetName);
    
    try {
      setIsLoading(prev => ({ ...prev, [targetCacheKey]: true }));
      
      // Get source schema
      const sourceSchema = await getNodeSchema(workflowId, sourceNodeId, { sheetName });
      
      if (!sourceSchema || sourceSchema.length === 0) {
        console.warn(`No schema available from source node ${sourceNodeId}`);
        setValidationErrors(prev => ({
          ...prev,
          [targetCacheKey]: [{ 
            code: 'source_schema_missing', 
            message: 'Source node does not have a valid schema' 
          }]
        }));
        return false;
      }
      
      // Apply transformation if provided
      const targetSchema = transform ? transform(sourceSchema) : sourceSchema;
      
      // Update target schema
      const effectiveSheetName = sheetName || 'Sheet1';
      await updateNodeSchema(workflowId, targetNodeId, targetSchema, {
        updateDb: true,
        source: 'propagation',
        sheetName: effectiveSheetName
      });
      
      return true;
    } catch (err) {
      console.error('Error in propagateSchema:', err);
      toast.error('Failed to propagate schema between nodes');
      return false;
    } finally {
      setIsLoading(prev => ({ ...prev, [targetCacheKey]: false }));
    }
  }, [getNodeSchema, updateNodeSchema, getCacheKey]);

  /**
   * Validate node configuration against schema
   */
  const validateNodeConfig = useCallback((
    config: any,
    schema: SchemaColumn[]
  ): {
    isValid: boolean;
    errors: SchemaValidationError[];
  } => {
    const errors: SchemaValidationError[] = [];
    
    if (!config) {
      return { isValid: true, errors: [] };
    }
    
    // Check if columns referenced in config exist in schema
    if (config.column && schema.length > 0) {
      const column = schema.find(col => col.name === config.column);
      
      if (!column) {
        errors.push({
          code: 'column_not_found',
          message: `Column "${config.column}" does not exist in the data`,
          field: 'column',
          suggestion: `Available columns: ${schema.map(c => c.name).join(', ')}`
        });
      } else {
        // Check type compatibility with operator
        if (config.operator) {
          const numericOperators = ['greater-than', 'less-than', 'between'];
          const stringOperators = ['contains', 'starts-with', 'ends-with'];
          
          if (column.type === 'number' && stringOperators.includes(config.operator)) {
            errors.push({
              code: 'incompatible_operator',
              message: `Operator "${config.operator}" cannot be used with numeric column "${config.column}"`,
              field: 'operator',
              suggestion: 'Use equals, not-equals, greater-than, or less-than for numbers'
            });
          }
          
          if (isTextType(column.type) && numericOperators.includes(config.operator)) {
            errors.push({
              code: 'incompatible_operator',
              message: `Operator "${config.operator}" cannot be used with text column "${config.column}"`,
              field: 'operator',
              suggestion: 'Use equals, not-equals, contains, starts-with, or ends-with for text'
            });
          }
          
          // Check value compatibility
          if (config.value !== undefined && config.value !== null) {
            if (column.type === 'number' && isNaN(Number(config.value)) && config.operator !== 'equals') {
              errors.push({
                code: 'invalid_value_type',
                message: `Value "${config.value}" is not a valid number for column "${config.column}"`,
                field: 'value',
                suggestion: 'Enter a numeric value'
              });
            }
            
            if (column.type === 'date' && isNaN(Date.parse(config.value)) && ['before', 'after', 'between'].includes(config.operator)) {
              errors.push({
                code: 'invalid_value_type',
                message: `Value "${config.value}" is not a valid date for column "${config.column}"`,
                field: 'value',
                suggestion: 'Enter a valid date'
              });
            }
          }
        }
      }
    }
    
    // For aggregation operations
    if (config.function && config.column && schema.length > 0) {
      const column = schema.find(col => col.name === config.column);
      
      if (!column) {
        errors.push({
          code: 'column_not_found',
          message: `Column "${config.column}" does not exist in the data`,
          field: 'column'
        });
      } else if (['sum', 'avg', 'min', 'max'].includes(config.function) && column.type !== 'number') {
        errors.push({
          code: 'incompatible_function',
          message: `Function "${config.function}" can only be used with numeric columns`,
          field: 'function',
          suggestion: 'Use count function for non-numeric columns'
        });
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }, []);

  /**
   * Clear schema cache for a specific node or all nodes
   */
  const clearSchemaCache = useCallback((nodeId?: string, sheetName?: string) => {
    if (nodeId && sheetName) {
      // Clear specific node+sheet combination
      const cacheKey = getCacheKey(nodeId, sheetName);
      setSchemaCache(prev => {
        const { [cacheKey]: _, ...rest } = prev;
        return rest;
      });
    } else if (nodeId) {
      // Clear all entries for a specific node (across all sheets)
      setSchemaCache(prev => {
        const newCache = { ...prev };
        Object.keys(newCache).forEach(key => {
          if (key.startsWith(`${nodeId}:`) || key === nodeId) {
            delete newCache[key];
          }
        });
        return newCache;
      });
    } else {
      // Clear all cache
      setSchemaCache({});
    }
  }, [getCacheKey]);

  /**
   * Get all sheets available for a specific node
   */
  const getNodeSheets = useCallback(async (
    workflowId: string,
    nodeId: string
  ): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .select('sheet_name')
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId);
        
      if (error) {
        console.error('Error fetching node sheets:', error);
        return [];
      }
      
      return data.map(item => item.sheet_name).filter(Boolean);
    } catch (err) {
      console.error('Error in getNodeSheets:', err);
      return [];
    }
  }, []);

  return {
    getNodeSchema,
    updateNodeSchema,
    propagateSchema,
    fetchAndPropagateSchema,
    validateNodeConfig,
    clearSchemaCache,
    getNodeSheets,
    schemaCache,
    isLoading,
    validationErrors,
    extractionStatus
  };
}

// This is where the validateNodeConfig function would remain unchanged
function validateNodeConfig(
  config: any,
  schema: SchemaColumn[]
): {
  isValid: boolean;
  errors: SchemaValidationError[];
} {
  const errors: SchemaValidationError[] = [];
  
  if (!config) {
    return { isValid: true, errors: [] };
    }
    
    // Check if columns referenced in config exist in schema
    if (config.column && schema.length > 0) {
      const column = schema.find(col => col.name === config.column);
      
      if (!column) {
        errors.push({
          code: 'column_not_found',
          message: `Column "${config.column}" does not exist in the data`,
          field: 'column',
          suggestion: `Available columns: ${schema.map(c => c.name).join(', ')}`
        });
      } else {
        // Check type compatibility with operator
        if (config.operator) {
          const numericOperators = ['greater-than', 'less-than', 'between'];
          const stringOperators = ['contains', 'starts-with', 'ends-with'];
          
          if (column.type === 'number' && stringOperators.includes(config.operator)) {
            errors.push({
              code: 'incompatible_operator',
              message: `Operator "${config.operator}" cannot be used with numeric column "${config.column}"`,
              field: 'operator',
              suggestion: 'Use equals, not-equals, greater-than, or less-than for numbers'
            });
          }
          
          if (isTextType(column.type) && numericOperators.includes(config.operator)) {
            errors.push({
              code: 'incompatible_operator',
              message: `Operator "${config.operator}" cannot be used with text column "${config.column}"`,
              field: 'operator',
              suggestion: 'Use equals, not-equals, contains, starts-with, or ends-with for text'
            });
          }
          
          // Check value compatibility
          if (config.value !== undefined && config.value !== null) {
            if (column.type === 'number' && isNaN(Number(config.value)) && config.operator !== 'equals') {
              errors.push({
                code: 'invalid_value_type',
                message: `Value "${config.value}" is not a valid number for column "${config.column}"`,
                field: 'value',
                suggestion: 'Enter a numeric value'
              });
            }
            
            if (column.type === 'date' && isNaN(Date.parse(config.value)) && ['before', 'after', 'between'].includes(config.operator)) {
              errors.push({
                code: 'invalid_value_type',
                message: `Value "${config.value}" is not a valid date for column "${config.column}"`,
                field: 'value',
                suggestion: 'Enter a valid date'
              });
            }
          }
        }
      }
    }
    
    // For aggregation operations
    if (config.function && config.column && schema.length > 0) {
      const column = schema.find(col => col.name === config.column);
      
      if (!column) {
        errors.push({
          code: 'column_not_found',
          message: `Column "${config.column}" does not exist in the data`,
          field: 'column'
        });
      } else if (['sum', 'avg', 'min', 'max'].includes(config.function) && column.type !== 'number') {
        errors.push({
          code: 'incompatible_function',
          message: `Function "${config.function}" can only be used with numeric columns`,
          field: 'function',
          suggestion: 'Use count function for non-numeric columns'
        });
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
