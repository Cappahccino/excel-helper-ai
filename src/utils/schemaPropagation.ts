
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';
import { 
  cacheSchema, 
  getSchemaFromCache, 
  getSchemaMetadataFromCache, 
  invalidateSchemaCache
} from '@/utils/schema';
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
 * Safely convert workflow ID to database format
 */
function safeConvertWorkflowId(workflowId: string): string {
  try {
    // Keep temp- prefix for caching but remove it for database operations
    return workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
  } catch (error) {
    console.error(`Error converting workflow ID: ${workflowId}`, error);
    return workflowId;
  }
}

/**
 * Check if a node is ready for schema propagation
 * Now updated to handle multiple sheets correctly
 */
export const isNodeReadyForSchemaPropagation = async (workflowId: string, nodeId: string, sheetName?: string): Promise<boolean> => {
  try {
    console.log(`Checking if node ${nodeId} is ready for propagation in workflow ${workflowId}`);
    
    // Normalize workflow ID (handle temp- prefix)
    const normalizedWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    console.log(`Checking if node ${nodeId} is ready for schema propagation in workflow ${normalizedWorkflowId}`);

    // First check for cached schema to avoid database query
    const cachedSchema = await getSchemaFromCache(workflowId, nodeId, {
      maxAge: 120000, // 2 minutes
      sheetName
    });
    
    if (cachedSchema && cachedSchema.length > 0) {
      console.log(`Node ${nodeId} has cached schema with ${cachedSchema.length} columns, ready for propagation`);
      return true;
    }
    
    // Query database for schema, retrieving all sheets for this node
    const { data: schemas, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns, sheet_name')
      .eq('workflow_id', normalizedWorkflowId)
      .eq('node_id', nodeId);
      
    if (error) {
      console.error('Error checking node readiness:', error);
      return false;
    }
    
    if (!schemas || schemas.length === 0) {
      console.log(`No schema found for node ${nodeId} in workflow ${normalizedWorkflowId}`);
      return false;
    }
    
    console.log(`Node ${nodeId} ready status: true, found ${schemas.length} schemas`);
    
    // If a specific sheet was requested, check if it exists
    if (sheetName) {
      const specificSheet = schemas.find(s => s.sheet_name === sheetName);
      if (!specificSheet) {
        console.log(`Requested sheet ${sheetName} not found for node ${nodeId}`);
        return false;
      }
      
      return specificSheet.columns && specificSheet.columns.length > 0;
    }
    
    // At least one schema exists
    return schemas.some(schema => schema.columns && schema.columns.length > 0);
  } catch (error) {
    console.error(`Error checking if node ${nodeId} is ready for propagation:`, error);
    return false;
  }
};

/**
 * Propagate schema directly from source to target node
 * Uses Edge Function for distributed processing with Redis
 */
export async function propagateSchemaDirectly(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    console.log(`Propagating schema: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName || 'default'}, workflow: ${workflowId}`);
    
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
          version: data.version,
          isTemporary: data.isTemporary
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
 * Updated to handle temporary schemas
 */
async function propagateSchemaDirectlyFallback(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    const dbWorkflowId = safeConvertWorkflowId(workflowId);
    
    console.log(`Using fallback propagation for ${sourceNodeId} -> ${targetNodeId} in workflow ${dbWorkflowId}`);
    
    // First check cache for source schema
    const cachedSchemaData = await getSchemaMetadataFromCache(workflowId, sourceNodeId, {
      maxAge: 10000, // 10 seconds
      sheetName
    });
    
    let schema;
    let isTemporary = false;
    let fileId = '00000000-0000-0000-0000-000000000000';
    
    if (cachedSchemaData && cachedSchemaData.schema && cachedSchemaData.schema.length > 0) {
      console.log(`Using cached schema for source node ${sourceNodeId}`);
      
      // Extract schema and temporary status from cache
      schema = {
        columns: cachedSchemaData.schema.map(col => col.name),
        data_types: cachedSchemaData.schema.reduce((acc, col) => {
          acc[col.name] = col.type;
          return acc;
        }, {} as Record<string, string>),
        file_id: cachedSchemaData.fileId || '00000000-0000-0000-0000-000000000000'
      };
      
      isTemporary = cachedSchemaData.isTemporary || false;
      fileId = cachedSchemaData.fileId || fileId;
      
      // Extract sheet name from cache if not provided
      if (!sheetName && cachedSchemaData.sheetName) {
        sheetName = cachedSchemaData.sheetName;
      }
    } else {
      // Get source schema from database - no longer filtering by is_temporary
      console.log(`Fetching schema for source node ${sourceNodeId} from database (workflow_id: ${dbWorkflowId})`);
      const { data: sourceSchema, error: sourceError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types, file_id, sheet_name, is_temporary')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId);
        
      if (sourceError || !sourceSchema || sourceSchema.length === 0) {
        console.error('Error or no schema found for source node:', sourceError || 'No schema found');
        return false;
      }
      
      console.log(`Found ${sourceSchema.length} schemas for source node ${sourceNodeId}:`, sourceSchema);
      
      schema = sourceSchema[0];
      isTemporary = schema.is_temporary || false;
      fileId = schema.file_id || fileId;
      
      if (sheetName && sourceSchema.length > 1) {
        const sheetSchema = sourceSchema.find(s => s.sheet_name === sheetName);
        if (sheetSchema) {
          schema = sheetSchema;
          isTemporary = sheetSchema.is_temporary || false;
          fileId = sheetSchema.file_id || fileId;
        }
      }
      
      // Cache the schema we just retrieved
      const schemaColumns = schema.columns.map(column => ({
        name: column,
        type: schema.data_types[column] || 'unknown'
      }));
      
      cacheSchema(workflowId, sourceNodeId, schemaColumns, {
        source: 'database',
        sheetName: sheetName || schema.sheet_name,
        isTemporary,
        fileId
      });
    }
    
    // Verify we have a valid schema to propagate
    if (!schema || !schema.columns || !Array.isArray(schema.columns) || schema.columns.length === 0) {
      console.error('Invalid source schema for propagation');
      return false;
    }
    
    // Standardize column names and types
    const standardizedColumns = standardizeSchemaColumns(
      schema.columns.map(column => ({
        name: column,
        type: schema.data_types[column] || 'unknown'
      }))
    );
    
    // Effective sheet name to use
    const effectiveSheetName = sheetName || schema.sheet_name || 'Sheet1';
    
    // Update target schema, preserving temporary status
    const targetSchema = {
      workflow_id: dbWorkflowId,
      node_id: targetNodeId,
      columns: standardizedColumns.map(col => col.name),
      data_types: standardizedColumns.reduce((acc, col) => {
        acc[col.name] = col.type;
        return acc;
      }, {} as Record<string, string>),
      file_id: fileId,
      sheet_name: effectiveSheetName,
      has_headers: true,
      is_temporary: isTemporary,
      updated_at: new Date().toISOString()
    };
    
    console.log(`Updating target schema for ${targetNodeId} with is_temporary=${isTemporary}, workflow_id=${dbWorkflowId}, sheet=${effectiveSheetName}`);
    
    const { error: targetError } = await supabase
      .from('workflow_file_schemas')
      .upsert(targetSchema, {
        onConflict: 'workflow_id,node_id,sheet_name'
      });
      
    if (targetError) {
      console.error('Error updating target schema:', targetError);
      return false;
    } else {
      console.log(`Successfully updated schema for target node ${targetNodeId}`);
      
      // Verify schema was created by querying it back
      const { data: verifyData, error: verifyError } = await supabase
        .from('workflow_file_schemas')
        .select('*')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', targetNodeId)
        .eq('sheet_name', targetSchema.sheet_name);
        
      if (verifyError) {
        console.error('Error verifying schema creation:', verifyError);
      } else {
        console.log(`Verification result: Found ${verifyData?.length || 0} schemas for target node ${targetNodeId}:`, verifyData);
      }
    }
    
    // Cache the target schema too
    cacheSchema(workflowId, targetNodeId, standardizedColumns, {
      source: 'propagation',
      sheetName: effectiveSheetName,
      isTemporary,
      fileId
    });
    
    console.log(`Schema successfully propagated from ${sourceNodeId} to ${targetNodeId} using fallback method`);
    return true;
  } catch (error) {
    console.error('Error in propagateSchemaDirectlyFallback:', error);
    return false;
  }
}

/**
 * Synchronize sheet selection between source and target nodes
 */
export const synchronizeNodesSheetSelection = async (
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string
): Promise<boolean> => {
  try {
    // Normalize workflow ID
    const normalizedWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    console.log(`Synchronizing sheet selection from ${sourceNodeId} to ${targetNodeId}`);
    
    // Get source node metadata to find selected sheet
    const { data: sourceFile } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', normalizedWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (!sourceFile || !sourceFile.metadata) {
      console.log(`No metadata found for source node ${sourceNodeId}`);
      return false;
    }
    
    const sourceMetadata = sourceFile.metadata as Record<string, any>;
    const selectedSheet = sourceMetadata.selected_sheet;
    
    if (!selectedSheet) {
      console.log(`No selected sheet found for source node ${sourceNodeId}`);
      return false;
    }
    
    console.log(`Found selected sheet "${selectedSheet}" for source node ${sourceNodeId}`);
    
    // Get target node metadata
    const { data: targetFile } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', normalizedWorkflowId)
      .eq('node_id', targetNodeId)
      .maybeSingle();
      
    const targetMetadata = targetFile?.metadata as Record<string, any> || {};
    
    // Update target node metadata with selected sheet
    const updatedMetadata = {
      ...targetMetadata,
      selected_sheet: selectedSheet
    };
    
    // Update target node
    const { error: updateError } = await supabase
      .from('workflow_files')
      .update({ metadata: updatedMetadata })
      .eq('workflow_id', normalizedWorkflowId)
      .eq('node_id', targetNodeId);
      
    if (updateError) {
      console.error('Error updating target node metadata:', updateError);
      return false;
    }
    
    console.log(`Successfully synchronized sheet selection to "${selectedSheet}" for target node ${targetNodeId}`);
    
    // Now propagate schema with the selected sheet
    return await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, selectedSheet);
  } catch (error) {
    console.error('Error synchronizing sheet selection:', error);
    return false;
  }
};

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
    
    console.log(`Force refreshing schema for node ${nodeId} in workflow ${dbWorkflowId}`);
    
    // Get schema from database - include both temporary and non-temporary schemas
    const { data: schema, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, sheet_name, is_temporary')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId);
      
    if (error || !schema || schema.length === 0) {
      console.error('No schema found for node:', nodeId, error);
      return [];
    }
    
    console.log(`Found ${schema.length} schemas for node ${nodeId}:`, schema);
    
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
      sheetName: targetSchema.sheet_name,
      isTemporary: targetSchema.is_temporary
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
    const sourceSchemaCache = await getSchemaMetadataFromCache(workflowId, sourceNodeId);
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
    const targetSchemaCache = await getSchemaMetadataFromCache(workflowId, targetNodeId);
    if (targetSchemaCache && targetSchemaCache.schema && targetSchemaCache.schema.length > 0) {
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
 * Propagate schema with retry mechanism
 * Updated to handle temporary schemas
 */
export async function propagateSchemaWithRetry(
  workflowId: string,
  sourceNodeId: string, 
  targetNodeId: string,
  options?: {
    maxRetries?: number;
    sheetName?: string;
    forceRefresh?: boolean;
  }
): Promise<boolean> {
  const maxRetries = options?.maxRetries || 3;
  const sheetName = options?.sheetName;
  const forceRefresh = options?.forceRefresh || false;
  
  let retries = 0;
  let success = false;
  
  while (retries < maxRetries && !success) {
    try {
      if (retries > 0) {
        console.log(`Retry ${retries}/${maxRetries} for schema propagation ${sourceNodeId} -> ${targetNodeId}`);
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, retries), 30000)));
      }
      
      // First try direct method via Edge Function
      if (retries === 0) {
        success = await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sheetName);
        if (success) break;
      }
      
      // Fallback method
      const dbWorkflowId = workflowId.startsWith('temp-') 
        ? workflowId.substring(5) 
        : workflowId;
      
      console.log(`Propagating schema (retry ${retries}) for ${sourceNodeId} -> ${targetNodeId} in workflow ${dbWorkflowId}`);
      
      // No longer filtering by is_temporary
      const { data: sourceSchema, error: sourceError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types, file_id, sheet_name, is_temporary')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId);
        
      if (sourceError || !sourceSchema || sourceSchema.length === 0) {
        console.error('Error or no schema found for source node:', sourceError || 'No schema found');
        retries++;
        continue;
      }
      
      console.log(`Retry ${retries}: Found ${sourceSchema.length} schemas for source node ${sourceNodeId}`);
      
      let schema = sourceSchema[0];
      let isTemporary = schema.is_temporary || false;
      
      if (sheetName && sourceSchema.length > 1) {
        const sheetSchema = sourceSchema.find(s => s.sheet_name === sheetName);
        if (sheetSchema) {
          schema = sheetSchema;
          isTemporary = sheetSchema.is_temporary || false;
        }
      }
      
      // Handle standardization
      const standardized = standardizeSchemaColumns(
        schema.columns.map(col => ({
          name: col,
          type: schema.data_types[col] || 'unknown'
        }))
      );
      
      // Update target schema, preserving temporary status
      const targetSchemaData = {
        workflow_id: dbWorkflowId,
        node_id: targetNodeId,
        columns: standardized.map(col => col.name),
        data_types: standardized.reduce((acc, col) => {
          acc[col.name] = col.type;
          return acc;
        }, {} as Record<string, string>),
        file_id: schema.file_id,
        sheet_name: sheetName || schema.sheet_name || 'Sheet1',
        has_headers: true,
        is_temporary: isTemporary,
        updated_at: new Date().toISOString()
      };
      
      console.log(`Retry ${retries}: Upserting schema for target node ${targetNodeId}:`, targetSchemaData);
      
      const { error: targetError } = await supabase
        .from('workflow_file_schemas')
        .upsert(targetSchemaData, {
          onConflict: 'workflow_id,node_id,sheet_name'
        });
      
      if (targetError) {
        console.error('Error updating target schema:', targetError);
        retries++;
        continue;
      }
      
      // Verify the schema was created
      const { data: verifyData, error: verifyError } = await supabase
        .from('workflow_file_schemas')
        .select('*')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', targetNodeId)
        .eq('sheet_name', targetSchemaData.sheet_name);
        
      if (verifyError) {
        console.error('Error verifying schema creation:', verifyError);
      } else {
        console.log(`Verification result: Found ${verifyData?.length || 0} schemas for target node ${targetNodeId}`);
      }
      
      // Cache both schemas
      cacheSchema(workflowId, sourceNodeId, standardized, {
        source: 'database',
        sheetName: sheetName || schema.sheet_name,
        isTemporary
      });
      
      cacheSchema(workflowId, targetNodeId, standardized, {
        source: 'propagation',
        sheetName: sheetName || schema.sheet_name,
        isTemporary
      });
      
      success = true;
    } catch (error) {
      console.error(`Error during retry ${retries} for schema propagation:`, error);
      retries++;
    }
  }
  
  return success;
}

/**
 * Get schema for filtering operations
 * Enhanced to better handle temporary IDs
 */
export async function getSchemaForFiltering(
  workflowId: string,
  nodeId: string,
  options?: {
    sheetName?: string;
    forceRefresh?: boolean;
  }
): Promise<SchemaColumn[]> {
  try {
    const { sheetName, forceRefresh = false } = options || {};
    
    // Check cache first unless force refresh requested
    if (!forceRefresh) {
      const cachedSchema = await getSchemaFromCache(workflowId, nodeId, { sheetName });
      if (cachedSchema && cachedSchema.length > 0) {
        console.log(`Using cached schema for filtering node ${nodeId}`);
        return cachedSchema;
      }
    }
    
    // Convert workflow ID safely for DB operations
    const dbWorkflowId = safeConvertWorkflowId(workflowId);
    
    console.log(`Fetching schema for filtering from database: workflowId=${dbWorkflowId}, nodeId=${nodeId}, sheet=${sheetName || 'default'}`);
    
    // Query the schema from the database
    const { data, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, sheet_name')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId);
    
    if (error) {
      console.error('Error fetching schema for filtering:', error);
      return [];
    }
    
    if (!data || data.length === 0) {
      console.log(`No schema found for node ${nodeId}`);
      return [];
    }
    
    // Find the right schema for the requested sheet
    let targetSchema = data[0];
    if (sheetName && data.length > 1) {
      const matchingSchema = data.find(s => s.sheet_name === sheetName);
      if (matchingSchema) targetSchema = matchingSchema;
    }
    
    // Convert to schema column format
    const schema = targetSchema.columns.map(column => ({
      name: column,
      type: targetSchema.data_types[column] || 'unknown'
    }));
    
    // Cache the schema for future use
    await cacheSchema(workflowId, nodeId, schema, {
      source: 'database',
      sheetName: targetSchema.sheet_name
    });
    
    return schema;
  } catch (error) {
    console.error('Error in getSchemaForFiltering:', error);
    return [];
  }
}

/**
 * Validate schema for filtering operations
 * This is useful for filtering nodes that require specific column types
 */
export function validateSchemaForFiltering(schema: SchemaColumn[]): SchemaColumn[] {
  if (!schema || !Array.isArray(schema)) {
    console.warn('Invalid schema provided to validateSchemaForFiltering');
    return [];
  }
  
  // Ensure all column types are properly standardized
  return schema.map(col => {
    // Ensure name is a valid string
    const name = col.name && typeof col.name === 'string' ? col.name : `column_${Math.random().toString(36).substring(2, 9)}`;
    
    // Handle type standardization
    let type = (col.type || 'unknown').toLowerCase();
    
    // Map types to standard formats
    if (['varchar', 'char', 'text', 'string', 'str'].includes(type)) {
      type = 'string';
    } else if (['int', 'integer', 'float', 'double', 'decimal', 'number', 'num', 'numeric'].includes(type)) {
      type = 'number';
    } else if (['date', 'datetime', 'timestamp', 'time'].includes(type)) {
      type = 'date';
    } else if (['bool', 'boolean'].includes(type)) {
      type = 'boolean';
    } else if (['object', 'json', 'map'].includes(type)) {
      type = 'object';
    } else if (['array', 'list'].includes(type)) {
      type = 'array';
    } else if (type === 'text') {
      type = 'string';
    } else {
      // Default to string if unknown
      console.warn(`Unknown column type "${type}" for column "${name}", defaulting to string`);
      type = 'string';
    }
    
    return {
      name,
      type: type as "string" | "number" | "boolean" | "object" | "date" | "unknown" | "array" | "text"
    };
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
    const cachedSchemaData = await getSchemaMetadataFromCache(workflowId, nodeId, { sheetName });
    
    if (cachedSchemaData && cachedSchemaData.schema && cachedSchemaData.schema.length > 0) {
      return {
        cacheStatus: 'hit',
        dbStatus: 'not_found', // We didn't check the DB
        schema: cachedSchemaData.schema
      };
    }
    
    // Get from database
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
    
    // Cache the schema
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

/**
 * List all schemas for a workflow - useful for debugging
 */
export async function listAllWorkflowSchemas(
  workflowId: string
): Promise<{
  schemas: Record<string, any>[];
  error?: string;
}> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    console.log(`Listing all schemas for workflow ${dbWorkflowId}`);
    
    const { data, error } = await supabase
      .from('workflow_file_schemas')
      .select('*')
      .eq('workflow_id', dbWorkflowId);
      
    if (error) {
      console.error('Error listing schemas:', error);
      return {
        schemas: [],
        error: error.message
      };
    }
    
    if (!data || data.length === 0) {
      console.log(`No schemas found for workflow ${dbWorkflowId}`);
      return { schemas: [] };
    }
    
    console.log(`Found ${data.length} schemas for workflow ${dbWorkflowId}:`, data);
    
    return { schemas: data };
  } catch (error) {
    console.error('Error in listAllWorkflowSchemas:', error);
    return {
      schemas: [],
      error: (error as Error).message
    };
  }
}
