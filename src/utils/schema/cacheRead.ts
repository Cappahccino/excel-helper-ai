
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn, SchemaCacheEntry, SchemaMetadata } from './types';
import { getCacheKey, getSchemaEntry, normalizeWorkflowId } from './cacheStore';

/**
 * Read schema from cache
 */
export function readSchemaFromCache(
  workflowId: string,
  nodeId: string,
  options?: {
    sheetName?: string;
  }
): SchemaColumn[] | null {
  // Normalize the workflow ID
  const normalizedWorkflowId = normalizeWorkflowId(workflowId);
  
  // Generate cache key
  const key = getCacheKey(normalizedWorkflowId, nodeId, { sheetName: options?.sheetName });
  
  // Get from cache
  const cacheEntry = getSchemaEntry(key);
  
  if (cacheEntry) {
    console.log(`Schema found in cache for ${nodeId} in workflow ${workflowId}`);
    return cacheEntry.schema;
  }
  
  console.log(`No schema found in cache for ${nodeId} in workflow ${workflowId}`);
  return null;
}

/**
 * Read schema with full metadata from cache
 */
export function readSchemaMetadataFromCache(
  workflowId: string,
  nodeId: string,
  options?: {
    sheetName?: string;
  }
): SchemaMetadata | null {
  // Normalize the workflow ID
  const normalizedWorkflowId = normalizeWorkflowId(workflowId);
  
  // Generate cache key
  const key = getCacheKey(normalizedWorkflowId, nodeId, { sheetName: options?.sheetName });
  
  // Get from cache
  const cacheEntry = getSchemaEntry(key);
  
  if (cacheEntry) {
    return {
      schema: cacheEntry.schema,
      fileId: cacheEntry.fileId,
      sheetName: cacheEntry.sheetName,
      source: cacheEntry.source,
      version: cacheEntry.version,
      isTemporary: cacheEntry.isTemporary
    };
  }
  
  return null;
}

/**
 * Read schema from database
 */
export async function fetchSchemaFromDatabase(
  workflowId: string,
  nodeId: string,
  options?: {
    sheetName?: string;
  }
): Promise<SchemaColumn[] | null> {
  try {
    if (!workflowId || workflowId === 'new') {
      return null;
    }
    
    // Convert temporary ID if necessary
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbWorkflowId)) {
      console.error(`Invalid workflow ID format for database: ${dbWorkflowId}`);
      return null;
    }
    
    const query = supabase
      .from('workflow_file_schemas')
      .select('*')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId);
    
    if (options?.sheetName) {
      query.eq('sheet_name', options.sheetName);
    }
    
    const { data, error } = await query.single();
    
    if (error) {
      if (error.code !== 'PGRST116') { // Not found error
        console.error('Error fetching schema from database:', error);
      }
      return null;
    }
    
    if (!data) {
      return null;
    }
    
    // Convert database format to SchemaColumn[]
    const schema: SchemaColumn[] = [];
    const columns = data.columns as string[];
    const dataTypes = data.data_types as Record<string, string>;
    
    columns.forEach(colName => {
      schema.push({
        name: colName,
        type: (dataTypes[colName] || 'string') as any
      });
    });
    
    // Cache the result
    await writeSchemaToCache(workflowId, nodeId, schema, {
      sheetName: data.sheet_name,
      source: "database",
      fileId: data.file_id,
      isTemporary: data.is_temporary
    });
    
    return schema;
  } catch (error) {
    console.error('Error in fetchSchemaFromDatabase:', error);
    return null;
  }
}

// Import here after declaration to avoid circular dependency
import { writeSchemaToCache } from './cacheWrite';
