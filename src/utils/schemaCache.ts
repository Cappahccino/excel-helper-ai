
import { SchemaColumn } from '@/hooks/useNodeManagement';

// Type for schema cache entries - updated to include isTemporary flag
type SchemaCacheEntry = {
  schema: SchemaColumn[];
  timestamp: number;
  sheetName?: string;
  source?: "manual" | "database" | "propagation" | "subscription" | "polling" | "refresh" | "manual_refresh";
  version?: number;
  isTemporary?: boolean;
  fileId?: string;
};

// In-memory schema cache
const schemaCache: Record<string, SchemaCacheEntry> = {};

/**
 * Get cache key for a schema
 */
function getCacheKey(workflowId: string, nodeId: string, options?: { sheetName?: string }): string {
  const sheetName = options?.sheetName || 'default';
  return `schema:${workflowId}:${nodeId}:${sheetName}`;
}

/**
 * Cache schema data
 */
export async function cacheSchema(
  workflowId: string,
  nodeId: string,
  schema: SchemaColumn[],
  options?: {
    sheetName?: string;
    source?: "manual" | "database" | "propagation" | "subscription" | "polling" | "refresh" | "manual_refresh";
    version?: number;
    isTemporary?: boolean;
    fileId?: string;
  }
): Promise<void> {
  if (!workflowId || !nodeId || !schema || !Array.isArray(schema)) {
    console.warn(`Invalid input for cacheSchema: workflowId=${workflowId}, nodeId=${nodeId}, schema=${Array.isArray(schema) ? schema.length : typeof schema}`);
    return;
  }

  const key = getCacheKey(workflowId, nodeId, options);
  
  schemaCache[key] = {
    schema: schema.filter(col => col && typeof col === 'object' && col.name),
    timestamp: Date.now(),
    sheetName: options?.sheetName,
    source: options?.source,
    version: options?.version,
    isTemporary: options?.isTemporary || false,
    fileId: options?.fileId
  };
  
  console.log(`Cached schema for node ${nodeId} with ${schema.length} columns, sheet: ${options?.sheetName || 'default'}`);
}

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
  if (!workflowId || !nodeId) {
    console.warn(`Invalid input for getSchemaFromCache: workflowId=${workflowId}, nodeId=${nodeId}`);
    return null;
  }
  
  const key = getCacheKey(workflowId, nodeId, options);
  const maxAge = options?.maxAge || 60000; // Default 1 minute
  
  const cached = schemaCache[key];
  if (!cached) {
    console.log(`No cache entry found for ${key}`);
    return null;
  }
  
  // Check if cache entry is still valid
  const age = Date.now() - cached.timestamp;
  if (age > maxAge) {
    console.log(`Cache entry for ${key} expired (age: ${age}ms, max: ${maxAge}ms)`);
    return null;
  }
  
  console.log(`Using cached schema for ${key} with ${cached.schema.length} columns (age: ${age}ms)`);
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
): Promise<{
  schema: SchemaColumn[];
  fileId?: string;
  sheetName?: string;
  source?: string;
  version?: number;
  isTemporary?: boolean;
} | null> {
  if (!workflowId || !nodeId) return null;
  
  const key = getCacheKey(workflowId, nodeId, options);
  const maxAge = options?.maxAge || 60000; // Default 1 minute
  
  const cached = schemaCache[key];
  if (!cached) return null;
  
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
 * Invalidate cache for a specific workflow and node
 */
export async function invalidateSchemaCache(
  workflowId: string,
  nodeId: string,
  sheetName?: string
): Promise<void> {
  if (!workflowId || !nodeId) {
    console.log(`Cannot invalidate cache: Invalid ID(s): wf=${workflowId}, node=${nodeId}`);
    return;
  }
  
  if (sheetName) {
    // Only invalidate the specific sheet
    const key = getCacheKey(workflowId, nodeId, { sheetName });
    if (schemaCache[key]) {
      console.log(`Invalidating schema cache for ${nodeId} sheet: ${sheetName}`);
      delete schemaCache[key];
    }
  } else {
    // Invalidate all sheets for this node
    console.log(`Invalidating all schema caches for node ${nodeId}`);
    const prefix = `schema:${workflowId}:${nodeId}:`;
    Object.keys(schemaCache).forEach(key => {
      if (key.startsWith(prefix)) {
        delete schemaCache[key];
      }
    });
  }
}

/**
 * Invalidate all cached schemas
 */
export async function invalidateAllSchemaCaches(): Promise<void> {
  console.log(`Invalidating all schema caches`);
  Object.keys(schemaCache).forEach(key => {
    delete schemaCache[key];
  });
}

/**
 * Invalidate all schemas for a specific workflow
 */
export async function invalidateWorkflowSchemaCache(
  workflowId: string
): Promise<void> {
  if (!workflowId) return;
  
  const prefix = `schema:${workflowId}:`;
  console.log(`Invalidating all schema caches for workflow ${workflowId}`);
  
  let count = 0;
  Object.keys(schemaCache).forEach(key => {
    if (key.startsWith(prefix)) {
      delete schemaCache[key];
      count++;
    }
  });
  
  console.log(`Invalidated ${count} cache entries for workflow ${workflowId}`);
}

/**
 * Dump cache contents for debugging
 */
export function getDebugCacheInfo(): { 
  totalEntries: number;
  entries: Record<string, { 
    columns: number; 
    age: number; 
    sheetName?: string;
  }>;
} {
  const now = Date.now();
  const entries: Record<string, { columns: number; age: number; sheetName?: string }> = {};
  
  Object.keys(schemaCache).forEach(key => {
    const entry = schemaCache[key];
    entries[key] = {
      columns: entry.schema.length,
      age: now - entry.timestamp,
      sheetName: entry.sheetName
    };
  });
  
  return {
    totalEntries: Object.keys(schemaCache).length,
    entries
  };
}
