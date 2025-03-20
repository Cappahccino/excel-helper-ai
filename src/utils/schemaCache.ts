// Re-export all schema cache functionality from the modular structure
export * from './schema';

// For direct backwards compatibility
import { 
  cacheSchema,
  writeSchemaToCache,
  getSchemaFromCache,
  getSchemaMetadataFromCache,
  isValidCacheExistsAsync,
  trackSuccessfulPropagation,
  wasRecentlyPropagated,
  normalizeWorkflowId
} from './schema';

// Explicit re-exports for old import statements
export {
  cacheSchema,
  writeSchemaToCache,
  getSchemaFromCache,
  getSchemaMetadataFromCache,
  isValidCacheExistsAsync,
  trackSuccessfulPropagation,
  wasRecentlyPropagated,
  normalizeWorkflowId
};

import { SchemaColumn } from '@/hooks/useNodeManagement';

// Cache entry type
interface CacheEntry {
  schema: SchemaColumn[];
  timestamp: number;
  source?: string;
}

// Cache store
const schemaCache: Record<string, CacheEntry> = {};

/**
 * Normalize workflow ID to handle temporary IDs
 */
export function normalizeWorkflowId(workflowId: string): string {
  return workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
}

/**
 * Get normalized cache key
 */
function getCacheKey(workflowId: string, nodeId: string, sheetName?: string): string {
  const normalizedId = normalizeWorkflowId(workflowId);
  return sheetName 
    ? `schema:${normalizedId}:${nodeId}:${sheetName}`
    : `schema:${normalizedId}:${nodeId}`;
}

/**
 * Store schema in cache
 */
export function cacheSchema(
  workflowId: string,
  nodeId: string,
  schema: SchemaColumn[],
  options: {
    source?: string;
    sheetName?: string;
  } = {}
): void {
  const cacheKey = getCacheKey(workflowId, nodeId, options.sheetName);
  
  schemaCache[cacheKey] = {
    schema,
    timestamp: Date.now(),
    source: options.source
  };
  
  // Also store in localStorage for persistence
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      schema,
      timestamp: Date.now(),
      source: options.source
    }));
  } catch (e) {
    console.warn('Failed to store schema in localStorage', e);
  }
}

/**
 * Retrieve schema from cache
 */
export async function getSchemaFromCache(
  workflowId: string,
  nodeId: string,
  options: {
    maxAge?: number;
    sheetName?: string;
  } = {}
): Promise<SchemaColumn[] | null> {
  const { maxAge = 60000, sheetName } = options;
  const cacheKey = getCacheKey(workflowId, nodeId, sheetName);
  const now = Date.now();
  
  // Check in-memory cache first
  if (schemaCache[cacheKey]) {
    if (now - schemaCache[cacheKey].timestamp < maxAge) {
      return schemaCache[cacheKey].schema;
    }
  }
  
  // Otherwise try localStorage
  try {
    const storedCache = localStorage.getItem(cacheKey);
    if (storedCache) {
      const parsedCache = JSON.parse(storedCache) as CacheEntry;
      if (now - parsedCache.timestamp < maxAge) {
        // Update in-memory cache
        schemaCache[cacheKey] = parsedCache;
        return parsedCache.schema;
      }
    }
  } catch (e) {
    console.warn('Failed to retrieve schema from localStorage', e);
  }
  
  return null;
}

/**
 * Invalidate schema cache for a specific node
 * This forces the next schema request to bypass the cache
 */
export async function invalidateSchemaCache(
  workflowId: string, 
  nodeId: string,
  sheetName?: string
): Promise<void> {
  try {
    const normalizedWorkflowId = normalizeWorkflowId(workflowId);
    
    // Create a cache key with or without the sheet name
    const cacheKey = getCacheKey(normalizedWorkflowId, nodeId, sheetName);
    
    // Clear from in-memory cache
    if (schemaCache[cacheKey]) {
      delete schemaCache[cacheKey];
    }
    
    // Clear from localStorage
    if (typeof window !== 'undefined') {
      // Try to invalidate the specific cache key first
      localStorage.removeItem(cacheKey);
      
      // Also clear any cache entries that start with this prefix
      // This handles both sheet-specific and default caches
      const keysToRemove = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`schema:${normalizedWorkflowId}:${nodeId}`)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
    
    console.log(`Invalidated schema cache for ${nodeId} ${sheetName ? `sheet ${sheetName}` : ''}`);
  } catch (error) {
    console.error(`Error invalidating schema cache:`, error);
  }
}

// Alias for backwards compatibility
export const invalidateWorkflowSchemaCache = invalidateSchemaCache;
