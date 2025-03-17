
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
  }
): void {
  const { source = 'database', sheetName } = options || {};
  const cacheKey = generateCacheKey(workflowId, nodeId, sheetName);
  
  schemaCache.set(cacheKey, {
    schema,
    timestamp: Date.now(),
    source,
    sheetName
  });
  
  console.log(`Cached schema for ${nodeId} (${schema.length} columns)`);
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
    console.log(`Using cached schema for ${nodeId} (${cached.schema.length} columns)`);
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
