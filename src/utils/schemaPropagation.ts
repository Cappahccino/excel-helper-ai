
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';
import { cacheSchema, getSchemaFromCache, invalidateSchemaCache } from './schemaCache';
import { standardizeSchemaColumns } from './schemaStandardization';

interface SheetInfo {
  name: string;
  index: number;
  rowCount?: number;
  isDefault?: boolean;
}

interface NodeMetadata {
  selected_sheet?: string;
  sheets?: SheetInfo[];
  [key: string]: any;
}

/**
 * Synchronize sheet selection between two nodes
 */
export async function synchronizeNodesSheetSelection(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string
): Promise<boolean> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Get source node metadata to find selected sheet
    const { data: sourceNodeData, error: sourceError } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (sourceError || !sourceNodeData?.metadata) {
      console.error('Error getting source node metadata:', sourceError || 'No metadata found');
      return false;
    }
    
    const sourceMetadata = sourceNodeData.metadata as NodeMetadata;
    const selectedSheet = sourceMetadata.selected_sheet || 'Sheet1';
    
    // Update target node metadata with selected sheet
    const { data: targetNodeData, error: targetError } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId)
      .maybeSingle();
      
    if (targetError) {
      console.error('Error getting target node metadata:', targetError);
      return false;
    }
    
    const targetMetadata = targetNodeData?.metadata as NodeMetadata || {};
    targetMetadata.selected_sheet = selectedSheet;
    
    // Update target node with new metadata
    const { error: updateError } = await supabase
      .from('workflow_files')
      .update({ metadata: targetMetadata })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId);
      
    if (updateError) {
      console.error('Error updating target node metadata:', updateError);
      return false;
    }
    
    // After synchronizing sheet selection, propagate schema
    return await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, selectedSheet);
  } catch (error) {
    console.error('Error in synchronizeNodesSheetSelection:', error);
    return false;
  }
}

/**
 * Propagate schema directly from source to target node
 * Now uses Edge Function for distributed processing with Redis
 */
export async function propagateSchemaDirectly(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    console.log(`Propagating schema: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName || 'default'}`);
    
    // Use schemaPropagation Edge Function
    const { data, error } = await supabase.functions.invoke('schemaPropagation', {
      body: {
        workflowId,
        sourceNodeId,
        targetNodeId,
        sheetName,
        forceRefresh: false
      }
    });
    
    if (error) {
      console.error('Error calling schemaPropagation Edge Function:', error);
      
      // Fallback to direct propagation
      return await propagateSchemaDirectlyFallback(workflowId, sourceNodeId, targetNodeId, sheetName);
    }
    
    if (data.status === 'already_processing') {
      console.log(`Schema propagation from ${sourceNodeId} to ${targetNodeId} already in progress`);
      return false;
    }
    
    if (data.success) {
      console.log(`Schema successfully propagated from ${sourceNodeId} to ${targetNodeId} via Edge Function`);
      
      // Cache the result locally
      if (data.schema) {
        const schemaColumns = data.schema.map((col: any) => ({
          name: col.name,
          type: col.type as "string" | "number" | "boolean" | "object" | "date" | "unknown" | "array" | "text"
        }));
        
        cacheSchema(workflowId, targetNodeId, schemaColumns, {
          source: 'propagation',
          sheetName: sheetName,
          version: data.version
        });
      }
      
      return true;
    } else {
      console.error('Edge Function returned error:', data.error);
      
      // Fallback to direct propagation
      return await propagateSchemaDirectlyFallback(workflowId, sourceNodeId, targetNodeId, sheetName);
    }
  } catch (error) {
    console.error('Error in propagateSchemaDirectly:', error);
    
    // Fallback to direct propagation
    return await propagateSchemaDirectlyFallback(workflowId, sourceNodeId, targetNodeId, sheetName);
  }
}

/**
 * Fallback direct propagation implementation
 * Used when Edge Function is unavailable
 */
async function propagateSchemaDirectlyFallback(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // First check cache for source schema
    const cachedSchema = await getSchemaFromCache(workflowId, sourceNodeId, {
      maxAge: 10000, // 10 seconds
      sheetName
    });
    
    let schema;
    
    if (cachedSchema) {
      console.log(`Using cached schema for source node ${sourceNodeId}`);
      
      // Convert to DB format from cached schema
      const columns = cachedSchema.map(col => col.name);
      const dataTypes = cachedSchema.reduce((acc, col) => {
        acc[col.name] = col.type;
        return acc;
      }, {} as Record<string, string>);
      
      schema = { 
        columns, 
        data_types: dataTypes,
        file_id: '00000000-0000-0000-0000-000000000000'
      };
    } else {
      // Get source schema from database
      const { data: sourceSchema, error: sourceError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types, file_id, sheet_name')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .is('is_temporary', false);
        
      if (sourceError || !sourceSchema || sourceSchema.length === 0) {
        console.error('Error or no schema found for source node:', sourceError || 'No schema found');
        return false;
      }
      
      schema = sourceSchema[0];
      
      if (sheetName && sourceSchema.length > 1) {
        const sheetSchema = sourceSchema.find(s => s.sheet_name === sheetName);
        if (sheetSchema) {
          schema = sheetSchema;
        }
      }
      
      // Cache the schema we just retrieved
      const schemaColumns = schema.columns.map(column => ({
        name: column,
        type: schema.data_types[column] || 'unknown'
      }));
      
      cacheSchema(workflowId, sourceNodeId, schemaColumns, {
        source: 'database',
        sheetName: sheetName || schema.sheet_name
      });
    }
    
    // Standardize column names and types
    const standardizedColumns = standardizeSchemaColumns(
      schema.columns.map(column => ({
        name: column,
        type: schema.data_types[column] || 'unknown'
      }))
    );
    
    // Update target schema
    const targetSchema = {
      workflow_id: dbWorkflowId,
      node_id: targetNodeId,
      columns: standardizedColumns.map(col => col.name),
      data_types: standardizedColumns.reduce((acc, col) => {
        acc[col.name] = col.type;
        return acc;
      }, {} as Record<string, string>),
      file_id: schema.file_id,
      sheet_name: sheetName || schema.sheet_name || 'Sheet1',
      has_headers: true,
      updated_at: new Date().toISOString()
    };
    
    const { error: targetError } = await supabase
      .from('workflow_file_schemas')
      .upsert(targetSchema, {
        onConflict: 'workflow_id,node_id,sheet_name'
      });
      
    if (targetError) {
      console.error('Error updating target schema:', targetError);
      return false;
    }
    
    // Cache the target schema too
    cacheSchema(workflowId, targetNodeId, standardizedColumns, {
      source: 'propagation',
      sheetName: sheetName || schema.sheet_name
    });
    
    console.log(`Schema successfully propagated from ${sourceNodeId} to ${targetNodeId} using fallback method`);
    return true;
  } catch (error) {
    console.error('Error in propagateSchemaDirectlyFallback:', error);
    return false;
  }
}

/**
 * Check if a node is ready for schema propagation
 */
export async function isNodeReadyForSchemaPropagation(
  workflowId: string,
  nodeId: string
): Promise<boolean> {
  try {
    // First check cache
    const cachedSchema = await getSchemaFromCache(workflowId, nodeId);
    if (cachedSchema && cachedSchema.length > 0) {
      return true;
    }
    
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    const { data: schema, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    if (error) {
      console.error('Error checking node readiness:', error);
      return false;
    }
    
    return !!schema && Array.isArray(schema.columns) && schema.columns.length > 0;
  } catch (error) {
    console.error('Error in isNodeReadyForSchemaPropagation:', error);
    return false;
  }
}

/**
 * Force refresh schema for a node from source
 */
export async function forceSchemaRefresh(
  workflowId: string,
  nodeId: string,
  sheetName?: string
): Promise<SchemaColumn[]> {
  try {
    // Invalidate cache first
    invalidateSchemaCache(workflowId, nodeId, sheetName);
    
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    const { data: schema, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, sheet_name')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .is('is_temporary', false);
      
    if (error || !schema || schema.length === 0) {
      console.error('No schema found for node:', nodeId);
      return [];
    }
    
    let targetSchema = schema[0];
    if (sheetName && schema.length > 1) {
      const sheetSchema = schema.find(s => s.sheet_name === sheetName);
      if (sheetSchema) {
        targetSchema = sheetSchema;
      }
    }
    
    const schemaColumns = targetSchema.columns.map(column => ({
      name: column,
      type: targetSchema.data_types[column] || 'unknown'
    }));
    
    // Cache the refreshed schema
    cacheSchema(workflowId, nodeId, schemaColumns, {
      source: 'database',
      sheetName: targetSchema.sheet_name
    });
    
    return schemaColumns;
  } catch (error) {
    console.error('Error in forceSchemaRefresh:', error);
    return [];
  }
}

/**
 * Check if schema propagation is needed between nodes
 */
export async function checkSchemaPropagationNeeded(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string
): Promise<boolean> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // First check if source node has a schema
    const sourceSchemaCache = await getSchemaFromCache(workflowId, sourceNodeId);
    if (!sourceSchemaCache) {
      const { data: sourceSchema, error: sourceError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .maybeSingle();
        
      if (sourceError || !sourceSchema) {
        console.log(`No source schema available for ${sourceNodeId}`);
        return false;
      }
    }
    
    // Check if target already has schema
    const targetSchemaCache = await getSchemaFromCache(workflowId, targetNodeId);
    if (targetSchemaCache && targetSchemaCache.length > 0) {
      console.log(`Target node ${targetNodeId} already has cached schema`);
      return false;
    }
    
    const { data: targetSchema, error: targetError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId)
      .maybeSingle();
      
    if (targetError) {
      console.error(`Error checking target schema for ${targetNodeId}:`, targetError);
      return true;
    }
    
    if (!targetSchema) {
      console.log(`No target schema exists for ${targetNodeId}, propagation needed`);
      return true;
    }
    
    // At this point both schemas exist, so we need to compare them
    // We'll just check if the target has any columns for simplicity
    const targetColumns = targetSchema.columns || [];
    
    if (targetColumns.length === 0) {
      console.log(`Target schema for ${targetNodeId} is empty, propagation needed`);
      return true;
    }
    
    console.log(`Schema propagation not needed for ${sourceNodeId} to ${targetNodeId}`);
    return false;
  } catch (error) {
    console.error('Error in checkSchemaPropagationNeeded:', error);
    return true; // Default to needing propagation if there's an error
  }
}

/**
 * Propagate schema with retry logic
 * Now uses the Edge Function with fallback to client-side implementation
 */
export async function propagateSchemaWithRetry(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    sheetName?: string;
    forceRefresh?: boolean;
    onProgress?: (attempt: number, maxAttempts: number) => void;
  }
): Promise<boolean> {
  const { 
    maxRetries = 3, 
    retryDelay = 1000, 
    sheetName,
    forceRefresh = false,
    onProgress
  } = options || {};
  
  let attempts = 0;
  
  while (attempts < maxRetries) {
    attempts++;
    
    if (onProgress) {
      onProgress(attempts, maxRetries);
    }
    
    console.log(`Propagating schema (attempt ${attempts}/${maxRetries}): ${sourceNodeId} → ${targetNodeId}`);
    
    try {
      // Check if source node has a schema first
      const isSourceReady = await isNodeReadyForSchemaPropagation(workflowId, sourceNodeId);
      
      if (!isSourceReady) {
        console.log(`Source node ${sourceNodeId} schema not ready, waiting...`);
        
        if (attempts === maxRetries) {
          console.error(`Max retries reached, source node ${sourceNodeId} schema not available`);
          return false;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      
      // If force refresh, invalidate cache
      if (forceRefresh) {
        invalidateSchemaCache(workflowId, sourceNodeId, sheetName);
        invalidateSchemaCache(workflowId, targetNodeId, sheetName);
      }
      
      // Attempt to propagate using Edge Function with fallback
      const success = await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sheetName);
      
      if (success) {
        console.log(`Schema propagation successful on attempt ${attempts}`);
        return true;
      }
      
      console.log(`Propagation attempt ${attempts} failed, will retry after delay`);
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempts - 1))); // Exponential backoff
    } catch (error) {
      console.error(`Error during propagation attempt ${attempts}:`, error);
      
      if (attempts === maxRetries) {
        console.error('Max retries reached');
        return false;
      }
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempts - 1)));
    }
  }
  
  console.error(`Failed to propagate schema after ${maxRetries} attempts`);
  return false;
}

/**
 * Get schema for filtering operations
 */
export async function getSchemaForFiltering(
  workflowId: string,
  nodeId: string,
  options?: {
    sheetName?: string;
    forceRefresh?: boolean;
  }
): Promise<SchemaColumn[]> {
  const { sheetName, forceRefresh = false } = options || {};
  
  try {
    // Check cache first unless force refresh
    if (!forceRefresh) {
      const cachedSchema = await getSchemaFromCache(workflowId, nodeId, { sheetName });
      if (cachedSchema && cachedSchema.length > 0) {
        return validateSchemaForFiltering(cachedSchema);
      }
    } else {
      // Invalidate cache if force refresh
      invalidateSchemaCache(workflowId, nodeId, sheetName);
    }
    
    // Get schema from database
    const schema = await forceSchemaRefresh(workflowId, nodeId, sheetName);
    
    if (schema.length > 0) {
      return validateSchemaForFiltering(schema);
    }
    
    return [];
  } catch (error) {
    console.error('Error in getSchemaForFiltering:', error);
    return [];
  }
}

/**
 * Validate schema columns for filtering operations
 */
export function validateSchemaForFiltering(schema: SchemaColumn[]): SchemaColumn[] {
  if (!schema || !Array.isArray(schema) || schema.length === 0) {
    return [];
  }
  
  // Filter out columns with missing names
  const validSchema = schema.filter(col => col && col.name);
  
  // Normalize types
  return validSchema.map(col => {
    let type = col.type || 'string';
    
    // Normalize type names
    if (['text', 'varchar', 'char'].includes(type.toString())) {
      type = 'string';
    } else if (['int', 'integer', 'float', 'decimal', 'double'].includes(type.toString())) {
      type = 'number';
    } else if (['datetime', 'timestamp'].includes(type.toString())) {
      type = 'date';
    } else if (['bool', 'boolean'].includes(type.toString())) {
      type = 'boolean';
    }
    
    return {
      name: col.name,
      type
    } as SchemaColumn;
  });
}

/**
 * Utility to get schema with debugging info
 */
export async function debugNodeSchema(
  workflowId: string,
  nodeId: string,
  sheetName?: string
): Promise<{
  cacheStatus: 'hit' | 'miss';
  dbStatus: 'found' | 'not_found' | 'error';
  schema: SchemaColumn[];
  error?: string;
}> {
  try {
    // Check cache
    const cachedSchema = await getSchemaFromCache(workflowId, nodeId, { sheetName });
    
    if (cachedSchema) {
      return {
        cacheStatus: 'hit',
        dbStatus: 'found', // Assume it came from DB originally
        schema: cachedSchema
      };
    }
    
    // Try database
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    const { data, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .eq('sheet_name', sheetName || 'Sheet1')
      .maybeSingle();
      
    if (error) {
      return {
        cacheStatus: 'miss',
        dbStatus: 'error',
        schema: [],
        error: error.message
      };
    }
    
    if (!data) {
      return {
        cacheStatus: 'miss',
        dbStatus: 'not_found',
        schema: []
      };
    }
    
    const schema = data.columns.map(column => ({
      name: column,
      type: data.data_types[column] || 'unknown'
    }));
    
    // Cache it for future use
    cacheSchema(workflowId, nodeId, schema, { sheetName });
    
    return {
      cacheStatus: 'miss',
      dbStatus: 'found',
      schema
    };
  } catch (error) {
    return {
      cacheStatus: 'miss',
      dbStatus: 'error',
      schema: [],
      error: (error as Error).message
    };
  }
}
