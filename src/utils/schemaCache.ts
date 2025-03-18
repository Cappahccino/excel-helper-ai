
/**
 * Schema cache utility for optimizing schema access and reducing database load
 * Uses Redis for persistent cache with in-memory fallback
 */

import { SchemaColumn } from '@/hooks/useNodeManagement';
import { supabase } from '@/integrations/supabase/client';

// Type definitions for schema cache
interface SchemaCacheEntry {
  schema: SchemaColumn[];
  timestamp: number;
  source: 'database' | 'propagation' | 'manual';
  sheetName?: string;
  version?: number;
}

// Fallback in-memory cache when Redis is unavailable
const inMemorySchemaCache = new Map<string, SchemaCacheEntry>();

// Default time-to-live for cache entries in milliseconds (30 seconds)
const DEFAULT_CACHE_TTL = 30 * 1000;

// Redis key prefixes for schema cache
const REDIS_SCHEMA_PREFIX = 'schema:';
const REDIS_VERSION_PREFIX = 'schema_version:';

/**
 * Generate a unique cache key for schema cache
 */
function generateCacheKey(workflowId: string, nodeId: string, sheetName?: string): string {
  return `${workflowId}:${nodeId}:${sheetName || 'default'}`;
}

/**
 * Generate a Redis key from cache key
 */
function generateRedisKey(cacheKey: string): string {
  return `${REDIS_SCHEMA_PREFIX}${cacheKey}`;
}

/**
 * Generate a Redis version key
 */
function generateVersionKey(cacheKey: string): string {
  return `${REDIS_VERSION_PREFIX}${cacheKey}`;
}

/**
 * Store schema in cache (Redis if available, with in-memory fallback)
 */
export async function cacheSchema(
  workflowId: string,
  nodeId: string, 
  schema: SchemaColumn[],
  options?: {
    source?: 'database' | 'propagation' | 'manual';
    sheetName?: string;
    version?: number;
  }
): Promise<void> {
  const { source = 'database', sheetName, version } = options || {};
  const cacheKey = generateCacheKey(workflowId, nodeId, sheetName);
  
  try {
    // Try to invoke the Edge Function to cache in Redis
    const { data, error } = await supabase.functions.invoke('schemaPropagation', {
      body: {
        action: 'cacheSchema',
        workflowId,
        nodeId,
        schema,
        source,
        sheetName,
        version
      }
    });
    
    if (!error && data?.success) {
      console.log(`Cached schema for ${nodeId} in Redis (${schema.length} columns, v${data.version || version || 1})`);
      return;
    }
  } catch (error) {
    console.warn('Error caching schema in Redis:', error);
  }
  
  // Fallback to in-memory cache
  const existingEntry = inMemorySchemaCache.get(cacheKey);
  const nextVersion = version || (existingEntry?.version || 0) + 1;
  
  inMemorySchemaCache.set(cacheKey, {
    schema,
    timestamp: Date.now(),
    source,
    sheetName,
    version: nextVersion
  });
  
  console.log(`Cached schema for ${nodeId} in memory (${schema.length} columns, v${nextVersion})`);
}

/**
 * Get schema from cache if available and not expired
 */
export async function getSchemaFromCache(
  workflowId: string,
  nodeId: string,
  options?: {
    maxAge?: number;
    sheetName?: string;
  }
): Promise<SchemaColumn[] | null> {
  const { maxAge = DEFAULT_CACHE_TTL, sheetName } = options || {};
  const cacheKey = generateCacheKey(workflowId, nodeId, sheetName);
  
  try {
    // Try Redis first via Edge Function
    const { data, error } = await supabase.functions.invoke('schemaPropagation', {
      body: {
        action: 'getSchema',
        workflowId,
        nodeId,
        sheetName,
        maxAge
      }
    });
    
    if (!error && data?.schema) {
      console.log(`Using Redis cached schema for ${nodeId} (${data.schema.length} columns, v${data.version || 1})`);
      return data.schema;
    }
  } catch (error) {
    console.warn('Error getting schema from Redis cache:', error);
  }
  
  // Fallback to in-memory cache
  const cached = inMemorySchemaCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < maxAge) {
    console.log(`Using in-memory cached schema for ${nodeId} (${cached.schema.length} columns, v${cached.version || 1})`);
    return cached.schema;
  }
  
  return null;
}

/**
 * Invalidate schema cache for a node
 */
export async function invalidateSchemaCache(
  workflowId: string,
  nodeId: string,
  sheetName?: string
): Promise<void> {
  try {
    // Try Redis invalidation via Edge Function
    await supabase.functions.invoke('schemaPropagation', {
      body: {
        action: 'invalidateSchema',
        workflowId,
        nodeId,
        sheetName
      }
    });
    
    console.log(`Invalidated Redis schema cache for ${nodeId}`);
  } catch (error) {
    console.warn('Error invalidating Redis schema cache:', error);
  }
  
  // Always invalidate in-memory cache regardless of Redis result
  if (sheetName) {
    // Invalidate specific sheet
    const cacheKey = generateCacheKey(workflowId, nodeId, sheetName);
    inMemorySchemaCache.delete(cacheKey);
  } else {
    // Invalidate all sheets for this node
    const prefix = `${workflowId}:${nodeId}:`;
    for (const key of inMemorySchemaCache.keys()) {
      if (key.startsWith(prefix)) {
        inMemorySchemaCache.delete(key);
      }
    }
  }
  
  console.log(`Invalidated in-memory schema cache for ${nodeId}`);
}

/**
 * Invalidate all schemas for a workflow
 */
export async function invalidateWorkflowSchemaCache(workflowId: string): Promise<void> {
  try {
    // Try Redis invalidation via Edge Function
    await supabase.functions.invoke('schemaPropagation', {
      body: {
        action: 'invalidateWorkflowSchema',
        workflowId
      }
    });
    
    console.log(`Invalidated Redis schema cache for workflow ${workflowId}`);
  } catch (error) {
    console.warn('Error invalidating Redis workflow schema cache:', error);
  }
  
  // Always invalidate in-memory cache regardless of Redis result
  const prefix = `${workflowId}:`;
  let count = 0;
  
  for (const key of inMemorySchemaCache.keys()) {
    if (key.startsWith(prefix)) {
      inMemorySchemaCache.delete(key);
      count++;
    }
  }
  
  console.log(`Invalidated in-memory schema cache for workflow ${workflowId} (${count} entries)`);
}

/**
 * Get all cached schemas for a workflow
 */
export async function getWorkflowCachedSchemas(workflowId: string): Promise<Record<string, SchemaColumn[]>> {
  try {
    // Try Redis first via Edge Function
    const { data, error } = await supabase.functions.invoke('schemaPropagation', {
      body: {
        action: 'getWorkflowSchemas',
        workflowId
      }
    });
    
    if (!error && data?.schemas) {
      return data.schemas;
    }
  } catch (error) {
    console.warn('Error getting workflow cached schemas from Redis:', error);
  }
  
  // Fallback to in-memory cache
  const result: Record<string, SchemaColumn[]> = {};
  const prefix = `${workflowId}:`;
  
  for (const [key, entry] of inMemorySchemaCache.entries()) {
    if (key.startsWith(prefix)) {
      const parts = key.split(':');
      if (parts.length >= 2) {
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
  const { maxAge = DEFAULT_CACHE_TTL, sheetName } = options || {};
  const cacheKey = generateCacheKey(workflowId, nodeId, sheetName);
  
  // Only check in-memory cache for this synchronous function
  const cached = inMemorySchemaCache.get(cacheKey);
  return !!cached && (Date.now() - cached.timestamp) < maxAge;
}

// Enhanced isValidCacheExists with async Redis check
export async function isValidCacheExistsAsync(
  workflowId: string,
  nodeId: string,
  options?: {
    maxAge?: number;
    sheetName?: string;
  }
): Promise<boolean> {
  return (await getSchemaFromCache(workflowId, nodeId, options)) !== null;
}

/**
 * Get cache health status
 */
export async function getSchemaCacheStatus(): Promise<{
  redisAvailable: boolean;
  inMemoryCacheSize: number;
}> {
  try {
    // Check Redis availability via Edge Function
    const { data, error } = await supabase.functions.invoke('schemaPropagation', {
      body: {
        action: 'healthCheck'
      }
    });
    
    return {
      redisAvailable: !error && data?.healthy === true,
      inMemoryCacheSize: inMemorySchemaCache.size
    };
  } catch (error) {
    console.warn('Error checking Redis health:', error);
    return {
      redisAvailable: false,
      inMemoryCacheSize: inMemorySchemaCache.size
    };
  }
}
