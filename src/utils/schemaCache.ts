
import { SchemaColumn } from '@/hooks/useNodeManagement';

// Type for schema cache entries - updated to include isTemporary flag
type SchemaCacheEntry = {
  schema: SchemaColumn[];
  timestamp: number;
  sheetName?: string;
  source?: "manual" | "database" | "propagation" | "subscription" | "polling" | "refresh" | "manual_refresh";
  version?: number;
  isTemporary?: boolean; // Added to track temporary status
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
    isTemporary?: boolean; // Added to track temporary status
  }
): Promise<void> {
  const key = getCacheKey(workflowId, nodeId, options);
  
  schemaCache[key] = {
    schema,
    timestamp: Date.now(),
    sheetName: options?.sheetName,
    source: options?.source,
    version: options?.version,
    isTemporary: options?.isTemporary || false // Default to false if not provided
  };
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
  const key = getCacheKey(workflowId, nodeId, options);
  const maxAge = options?.maxAge || 60000; // Default 1 minute
  
  const cached = schemaCache[key];
  if (!cached) return null;
  
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
): Promise<{
  schema: SchemaColumn[];
  fileId?: string;
  sheetName?: string;
  source?: string;
  version?: number;
  isTemporary?: boolean;
} | null> {
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
    isTemporary: cached.isTemporary
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
  const key = getCacheKey(workflowId, nodeId, { sheetName });
  delete schemaCache[key];
}

/**
 * Invalidate all cached schemas
 */
export async function invalidateAllSchemaCaches(): Promise<void> {
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
  const prefix = `schema:${workflowId}:`;
  Object.keys(schemaCache).forEach(key => {
    if (key.startsWith(prefix)) {
      delete schemaCache[key];
    }
  });
}
