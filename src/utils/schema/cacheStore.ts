
// In-memory schema cache
const schemaCache: Record<string, SchemaCacheEntry> = {};

// Cache expiration tracking
const cacheExpirations: Record<string, number> = {};

// Default TTL for cache entries (5 minutes)
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

// Successful propagation tracking
const successfulPropagations: Record<string, {
  timestamp: number;
  version?: number;
}> = {};

/**
 * Get cache key for a schema
 */
export function getCacheKey(workflowId: string, nodeId: string, options?: { sheetName?: string }): string {
  // Remove 'temp-' prefix from workflowId if present for consistent keys
  const normalizedWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
  const sheetName = options?.sheetName || 'default';
  return `schema:${normalizedWorkflowId}:${nodeId}:${sheetName}`;
}

/**
 * Get propagation tracking key
 */
export function getPropagationKey(workflowId: string, sourceId: string, targetId: string, sheetName?: string): string {
  // Remove 'temp-' prefix from workflowId if present for consistent keys
  const normalizedWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
  const sheet = sheetName || 'default';
  return `prop:${normalizedWorkflowId}:${sourceId}:${targetId}:${sheet}`;
}

/**
 * Normalize workflow ID to handle temporary IDs consistently
 */
export function normalizeWorkflowId(workflowId: string): string {
  // Keep the ID format consistent whether it has the temp- prefix or not
  return workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
}

/**
 * Track successful schema propagation
 */
export function trackSuccessfulPropagation(
  workflowId: string,
  sourceId: string,
  targetId: string,
  options?: {
    sheetName?: string;
    version?: number;
  }
): void {
  const key = getPropagationKey(workflowId, sourceId, targetId, options?.sheetName);
  successfulPropagations[key] = {
    timestamp: Date.now(),
    version: options?.version
  };
}

/**
 * Check if a propagation was recently successful
 */
export function wasRecentlyPropagated(
  workflowId: string,
  sourceId: string,
  targetId: string,
  options?: {
    sheetName?: string;
    maxAge?: number;
  }
): boolean {
  const key = getPropagationKey(workflowId, sourceId, targetId, options?.sheetName);
  const entry = successfulPropagations[key];
  
  if (!entry) return false;
  
  const maxAge = options?.maxAge || 30000; // Default 30 seconds
  return (Date.now() - entry.timestamp) < maxAge;
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
      defaultTtl = 15 * 60 * 1000; // 15 minutes for database/manual sources
    } else if (entry.source === 'propagation') {
      defaultTtl = 10 * 60 * 1000; // 10 minutes for propagated schemas
    } else if (entry.source === 'subscription' || entry.source === 'polling') {
      defaultTtl = 20 * 60 * 1000; // 20 minutes for subscription/polling (more trusted)
    }
    
    // Temporary schemas expire faster
    if (entry.isTemporary) {
      defaultTtl = Math.min(defaultTtl, 3 * 60 * 1000); // Max 3 minutes for temporary schemas
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
  
  // Also clear propagation history
  Object.keys(successfulPropagations).forEach(key => {
    delete successfulPropagations[key];
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
  
  // Also clean up old propagation history
  Object.keys(successfulPropagations).forEach(key => {
    if (now - successfulPropagations[key].timestamp > 30 * 60 * 1000) { // 30 minutes
      delete successfulPropagations[key];
    }
  });
  
  return removedCount;
}
