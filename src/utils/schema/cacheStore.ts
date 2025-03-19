
import { SchemaCacheEntry } from './types';

// In-memory schema cache
const schemaCache: Record<string, SchemaCacheEntry> = {};

// Cache expiration tracking
const cacheExpirations: Record<string, number> = {};

// Default TTL for cache entries (5 minutes)
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Get cache key for a schema
 */
export function getCacheKey(workflowId: string, nodeId: string, options?: { sheetName?: string }): string {
  const sheetName = options?.sheetName || 'default';
  return `schema:${workflowId}:${nodeId}:${sheetName}`;
}

/**
 * Normalize workflow ID to handle temporary IDs consistently
 */
export function normalizeWorkflowId(workflowId: string): string {
  // Keep the ID format consistent whether it has the temp- prefix or not
  return workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
}

/**
 * Get a schema cache entry
 */
export function getSchemaEntry(key: string): SchemaCacheEntry | null {
  // Check if cache entry exists and hasn't expired
  const entry = schemaCache[key];
  if (!entry) return null;
  
  const expirationTime = cacheExpirations[key] || (entry.timestamp + DEFAULT_CACHE_TTL);
  if (Date.now() > expirationTime) {
    // Entry has expired, remove it
    delete schemaCache[key];
    delete cacheExpirations[key];
    return null;
  }
  
  return entry;
}

/**
 * Set a schema cache entry with optional TTL
 */
export function setSchemaEntry(key: string, entry: SchemaCacheEntry, ttlMs?: number): void {
  schemaCache[key] = entry;
  
  // Set expiration time if provided
  if (ttlMs) {
    cacheExpirations[key] = Date.now() + ttlMs;
  } else {
    // Use default TTL based on source or entry type
    let defaultTtl = DEFAULT_CACHE_TTL;
    
    // Extend TTL for certain sources that are more stable
    if (entry.source === 'database' || entry.source === 'manual') {
      defaultTtl = 10 * 60 * 1000; // 10 minutes for database/manual sources
    } else if (entry.source === 'propagation') {
      defaultTtl = 5 * 60 * 1000; // 5 minutes for propagated schemas
    } else if (entry.source === 'subscription' || entry.source === 'polling') {
      defaultTtl = 15 * 60 * 1000; // 15 minutes for subscription/polling (more trusted)
    }
    
    // Temporary schemas expire faster
    if (entry.isTemporary) {
      defaultTtl = Math.min(defaultTtl, 2 * 60 * 1000); // Max 2 minutes for temporary schemas
    }
    
    cacheExpirations[key] = Date.now() + defaultTtl;
  }
}

/**
 * Delete a schema cache entry
 */
export function deleteSchemaEntry(key: string): void {
  delete schemaCache[key];
  delete cacheExpirations[key];
}

/**
 * Get all schema cache entries that match a prefix
 */
export function getSchemaEntriesByPrefix(prefix: string): Record<string, SchemaCacheEntry> {
  const result: Record<string, SchemaCacheEntry> = {};
  
  Object.keys(schemaCache).forEach(key => {
    if (key.startsWith(prefix)) {
      // Only include non-expired entries
      const expirationTime = cacheExpirations[key] || (schemaCache[key].timestamp + DEFAULT_CACHE_TTL);
      if (Date.now() <= expirationTime) {
        result[key] = schemaCache[key];
      }
    }
  });
  
  return result;
}

/**
 * Clear the entire schema cache
 */
export function clearSchemaCache(): void {
  Object.keys(schemaCache).forEach(key => {
    delete schemaCache[key];
  });
  
  Object.keys(cacheExpirations).forEach(key => {
    delete cacheExpirations[key];
  });
}

/**
 * Cleanup expired cache entries
 * Should be called periodically
 */
export function cleanupExpiredEntries(): number {
  const now = Date.now();
  let removedCount = 0;
  
  Object.keys(cacheExpirations).forEach(key => {
    if (now > cacheExpirations[key]) {
      delete schemaCache[key];
      delete cacheExpirations[key];
      removedCount++;
    }
  });
  
  return removedCount;
}
