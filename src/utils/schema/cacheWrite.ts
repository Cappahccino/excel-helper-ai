
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn, SchemaCacheEntry } from './types';
import { getCacheKey, setSchemaEntry, normalizeWorkflowId } from './cacheStore';

/**
 * Write schema to cache with metadata
 */
export async function writeSchemaToCache(
  workflowId: string,
  nodeId: string,
  schema: SchemaColumn[],
  options?: {
    sheetName?: string;
    source?: "manual" | "database" | "propagation" | "subscription" | "polling" | "refresh" | "manual_refresh";
    isTemporary?: boolean;
    fileId?: string;
    version?: number;
  }
): Promise<void> {
  // Normalize the workflow ID
  const normalizedWorkflowId = normalizeWorkflowId(workflowId);
  
  // Generate cache key
  const key = getCacheKey(normalizedWorkflowId, nodeId, { sheetName: options?.sheetName });
  
  // Create cache entry
  const cacheEntry: SchemaCacheEntry = {
    schema,
    timestamp: Date.now(),
    sheetName: options?.sheetName,
    source: options?.source || "manual",
    version: options?.version || 1,
    isTemporary: options?.isTemporary || false,
    fileId: options?.fileId
  };
  
  // Store in cache
  setSchemaEntry(key, cacheEntry);
  
  console.log(`Schema written to cache for ${nodeId} in workflow ${workflowId} with key ${key}`);
}

/**
 * Write schema to both cache and database
 */
export async function persistSchemaToDatabase(
  workflowId: string,
  nodeId: string,
  schema: SchemaColumn[],
  options?: {
    sheetName?: string;
    fileId?: string;
    isTemporary?: boolean;
  }
): Promise<boolean> {
  try {
    // First write to cache
    await writeSchemaToCache(workflowId, nodeId, schema, {
      ...options,
      source: "database"
    });
    
    // Skip database persistence for temporary workflows or when no workflow ID
    if (!workflowId || workflowId === 'new') {
      console.log(`Skipping database persistence for temporary workflow: ${workflowId}`);
      return true;
    }
    
    // Convert temporary ID if necessary
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbWorkflowId)) {
      console.error(`Invalid workflow ID format for database: ${dbWorkflowId}`);
      return false;
    }
    
    // Get file ID if available
    const fileId = options?.fileId;
    
    if (!fileId) {
      console.warn(`No file ID provided for schema persistence for node ${nodeId}`);
    }
    
    // Extract column names and types
    const columnNames = schema.map(col => col.name);
    const dataTypes: Record<string, string> = {};
    
    schema.forEach(col => {
      dataTypes[col.name] = col.type;
    });
    
    // Insert or update schema in database
    const { error } = await supabase
      .from('workflow_file_schemas')
      .upsert(
        {
          workflow_id: dbWorkflowId,
          node_id: nodeId,
          file_id: fileId,
          columns: columnNames,
          data_types: dataTypes,
          sheet_name: options?.sheetName,
          is_temporary: options?.isTemporary || false,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'workflow_id,node_id',
          ignoreDuplicates: false
        }
      );
    
    if (error) {
      console.error('Error persisting schema to database:', error);
      return false;
    }
    
    console.log(`Schema successfully persisted to database for ${nodeId} in workflow ${dbWorkflowId}`);
    return true;
  } catch (error) {
    console.error('Error in persistSchemaToDatabase:', error);
    return false;
  }
}
