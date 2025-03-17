
/**
 * Schema cache utility for optimizing schema access and reducing database load
 */

import { SchemaColumn } from '@/hooks/useNodeManagement';

// Type definitions for schema cache
interface SchemaCacheEntry {
  schema: SchemaColumn[];
  timestamp: number;
  source: 'database' | 'propagation' | 'manual';
  sheetName?: string;
  version?: number;
}

// Cache schema data in memory to reduce database calls
const schemaCache = new Map<string, SchemaCacheEntry>();

// Default time-to-live for cache entries in milliseconds (30 seconds)
const DEFAULT_CACHE_TTL = 30 * 1000;

/**
 * Generate a unique cache key for schema cache
 */
function generateCacheKey(workflowId: string, nodeId: string, sheetName?: string): string {
  return `${workflowId}:${nodeId}:${sheetName || 'default'}`;
}

/**
 * Store schema in cache
 */
export function cacheSchema(
  workflowId: string,
  nodeId: string, 
  schema: SchemaColumn[],
  options?: {
    source?: 'database' | 'propagation' | 'manual';
    sheetName?: string;
    version?: number;
  }
): void {
  const { source = 'database', sheetName, version } = options || {};
  const cacheKey = generateCacheKey(workflowId, nodeId, sheetName);
  
  // Get existing cache entry to increment version if needed
  const existingEntry = schemaCache.get(cacheKey);
  const nextVersion = version || (existingEntry?.version || 0) + 1;
  
  schemaCache.set(cacheKey, {
    schema,
    timestamp: Date.now(),
    source,
    sheetName,
    version: nextVersion
  });
  
  console.log(`Cached schema for ${nodeId} (${schema.length} columns, v${nextVersion})`);
}

/**
 * Get schema from cache if available and not expired
 */
export function getSchemaFromCache(
  workflowId: string,
  nodeId: string,
  options?: {
    maxAge?: number;
    sheetName?: string;
  }
): SchemaColumn[] | null {
  const { maxAge = DEFAULT_CACHE_TTL, sheetName } = options || {};
  const cacheKey = generateCacheKey(workflowId, nodeId, sheetName);
  
  const cached = schemaCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < maxAge) {
    console.log(`Using cached schema for ${nodeId} (${cached.schema.length} columns, v${cached.version || 1})`);
    return cached.schema;
  }
  
  return null;
}

/**
 * Invalidate schema cache for a node
 */
export function invalidateSchemaCache(
  workflowId: string,
  nodeId: string,
  sheetName?: string
): void {
  if (sheetName) {
    // Invalidate specific sheet
    const cacheKey = generateCacheKey(workflowId, nodeId, sheetName);
    schemaCache.delete(cacheKey);
  } else {
    // Invalidate all sheets for this node
    const prefix = `${workflowId}:${nodeId}:`;
    for (const key of schemaCache.keys()) {
      if (key.startsWith(prefix)) {
        schemaCache.delete(key);
      }
    }
  }
  
  console.log(`Invalidated schema cache for ${nodeId}`);
}

/**
 * Invalidate all schemas for a workflow
 */
export function invalidateWorkflowSchemaCache(workflowId: string): void {
  const prefix = `${workflowId}:`;
  let count = 0;
  
  for (const key of schemaCache.keys()) {
    if (key.startsWith(prefix)) {
      schemaCache.delete(key);
      count++;
    }
  }
  
  console.log(`Invalidated schema cache for workflow ${workflowId} (${count} entries)`);
}

/**
 * Get all cached schemas for a workflow
 */
export function getWorkflowCachedSchemas(workflowId: string): Record<string, SchemaColumn[]> {
  const result: Record<string, SchemaColumn[]> = {};
  const prefix = `${workflowId}:`;
  
  for (const [key, entry] of schemaCache.entries()) {
    if (key.startsWith(prefix)) {
      const parts = key.split(':');
      if (parts.length >= 3) {
        const nodeId = parts[1];
        result[nodeId] = entry.schema;
      }
    }
  }
  
  return result;
}

/**
 * Check if schema cache exists and is valid for a node
 */
export function isValidCacheExists(
  workflowId: string,
  nodeId: string,
  options?: {
    maxAge?: number;
    sheetName?: string;
  }
): boolean {
  return getSchemaFromCache(workflowId, nodeId, options) !== null;
}
