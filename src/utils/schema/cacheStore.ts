import { SchemaCacheEntry } from './types';

// In-memory schema cache
const schemaCache: Record<string, SchemaCacheEntry> = {};

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
  return schemaCache[key] || null;
}

/**
 * Set a schema cache entry
 */
export function setSchemaEntry(key: string, entry: SchemaCacheEntry): void {
  schemaCache[key] = entry;
}

/**
 * Delete a schema cache entry
 */
export function deleteSchemaEntry(key: string): void {
  delete schemaCache[key];
}

/**
 * Get all schema cache entries that match a prefix
 */
export function getSchemaEntriesByPrefix(prefix: string): Record<string, SchemaCacheEntry> {
  const result: Record<string, SchemaCacheEntry> = {};
  
  Object.keys(schemaCache).forEach(key => {
    if (key.startsWith(prefix)) {
      result[key] = schemaCache[key];
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
}
