
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { SchemaMetadata } from './types';
import { getCacheKey, normalizeWorkflowId, getSchemaEntry } from './cacheStore';

/**
 * Get schema from cache if available and not expired
 */
export async function getSchemaFromCache(
  workflowId: string,
  nodeId: string,
  options?: {
    maxAge?: number; // maximum age in milliseconds
    sheetName?: string;
  }
): Promise<SchemaColumn[] | null> {
  const normalizedWorkflowId = normalizeWorkflowId(workflowId);
  const key = getCacheKey(normalizedWorkflowId, nodeId, options);
  const maxAge = options?.maxAge || 60000; // Default 1 minute
  
  const cached = getSchemaEntry(key);
  if (!cached) {
    // Try with default sheet if explicit sheet not found
    if (options?.sheetName && options.sheetName !== 'default') {
      const defaultKey = getCacheKey(normalizedWorkflowId, nodeId, { sheetName: 'default' });
      const defaultCached = getSchemaEntry(defaultKey);
      
      if (defaultCached) {
        const age = Date.now() - defaultCached.timestamp;
        if (age <= maxAge) {
          console.log(`No cache for sheet ${options.sheetName}, using default sheet cache`);
          return defaultCached.schema;
        }
      }
    }
    return null;
  }
  
  // Check if cache entry is still valid
  const age = Date.now() - cached.timestamp;
  if (age > maxAge) return null;
  
  return cached.schema;
}

/**
 * Get full schema metadata from cache if available and not expired
 */
export async function getSchemaMetadataFromCache(
  workflowId: string,
  nodeId: string,
  options?: {
    maxAge?: number; // maximum age in milliseconds
    sheetName?: string;
  }
): Promise<SchemaMetadata | null> {
  const key = getCacheKey(workflowId, nodeId, options);
  const maxAge = options?.maxAge || 60000; // Default 1 minute
  
  const cached = getSchemaEntry(key);
  if (!cached) {
    // Try with default sheet if explicit sheet not found
    if (options?.sheetName && options.sheetName !== 'default') {
      const defaultKey = getCacheKey(workflowId, nodeId, { sheetName: 'default' });
      const defaultCached = getSchemaEntry(defaultKey);
      
      if (defaultCached) {
        const age = Date.now() - defaultCached.timestamp;
        if (age <= maxAge) {
          return {
            schema: defaultCached.schema,
            sheetName: defaultCached.sheetName,
            source: defaultCached.source,
            version: defaultCached.version,
            isTemporary: defaultCached.isTemporary,
            fileId: defaultCached.fileId
          };
        }
      }
    }
    return null;
  }
  
  // Check if cache entry is still valid
  const age = Date.now() - cached.timestamp;
  if (age > maxAge) return null;
  
  return {
    schema: cached.schema,
    sheetName: cached.sheetName,
    source: cached.source,
    version: cached.version,
    isTemporary: cached.isTemporary,
    fileId: cached.fileId
  };
}

/**
 * Check if a valid cache exists for the given workflow and node
 */
export async function isValidCacheExistsAsync(
  workflowId: string,
  nodeId: string,
  options?: {
    maxAge?: number;
    sheetName?: string;
  }
): Promise<boolean> {
  const schema = await getSchemaFromCache(workflowId, nodeId, options);
  return schema !== null && schema.length > 0;
}

/**
 * Get all cached schemas for a workflow
 */
export async function getWorkflowCachedSchemas(
  workflowId: string
): Promise<Record<string, SchemaColumn[]>> {
  const prefix = `schema:${workflowId}:`;
  const result: Record<string, SchemaColumn[]> = {};
  
  const schemaEntries = getSchemaEntriesByPrefix(prefix);
  
  Object.keys(schemaEntries).forEach(key => {
    const parts = key.split(':');
    if (parts.length >= 4) {
      const nodeId = parts[2];
      const schema = schemaEntries[key].schema;
      result[nodeId] = schema;
    }
  });
  
  return result;
}

// Imported in cacheRead.ts but defined in cacheStore.ts
import { getSchemaEntriesByPrefix } from './cacheStore';
