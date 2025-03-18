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
 * Normalize workflow ID to handle temporary IDs consistently
 */
function normalizeWorkflowId(workflowId: string): string {
  // Keep the ID format consistent whether it has the temp- prefix or not
  return workflowId;
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
  const normalizedWorkflowId = normalizeWorkflowId(workflowId);
  const key = getCacheKey(normalizedWorkflowId, nodeId, options);
  
  schemaCache[key] = {
    schema,
    timestamp: Date.now(),
    sheetName: options?.sheetName,
    source: options?.source,
    version: options?.version,
    isTemporary: options?.isTemporary || false,
    fileId: options?.fileId
  };
  
  // Also cache under the default sheet if we're dealing with a sheet-less schema
  // This helps with fallback mechanisms
  if (!options?.sheetName && workflowId && nodeId) {
    const defaultKey = getCacheKey(normalizedWorkflowId, nodeId, { sheetName: 'default' });
    if (defaultKey !== key) {
      schemaCache[defaultKey] = {
        ...schemaCache[key],
        sheetName: 'default'
      };
    }
  }
  
  // Log cache operation for debugging
  console.log(`Schema cached for ${nodeId} with sheet "${options?.sheetName || 'default'}" in workflow ${workflowId}. Source: ${options?.source}`);
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
  const normalizedWorkflowId = normalizeWorkflowId(workflowId);
  const key = getCacheKey(normalizedWorkflowId, nodeId, options);
  const maxAge = options?.maxAge || 60000; // Default 1 minute
  
  const cached = schemaCache[key];
  if (!cached) {
    // Try with default sheet if explicit sheet not found
    if (options?.sheetName && options.sheetName !== 'default') {
      const defaultKey = getCacheKey(normalizedWorkflowId, nodeId, { sheetName: 'default' });
      const defaultCached = schemaCache[defaultKey];
      
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
  if (!cached) {
    // Try with default sheet if explicit sheet not found
    if (options?.sheetName && options.sheetName !== 'default') {
      const defaultKey = getCacheKey(workflowId, nodeId, { sheetName: 'default' });
      const defaultCached = schemaCache[defaultKey];
      
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
 * Invalidate cache for a specific workflow and node
 */
export async function invalidateSchemaCache(
  workflowId: string,
  nodeId: string,
  sheetName?: string
): Promise<void> {
  const normalizedWorkflowId = normalizeWorkflowId(workflowId);
  const key = getCacheKey(normalizedWorkflowId, nodeId, { sheetName });
  delete schemaCache[key];
  
  // If no specific sheet was provided, also invalidate the default sheet
  if (!sheetName) {
    const defaultKey = getCacheKey(normalizedWorkflowId, nodeId, { sheetName: 'default' });
    delete schemaCache[defaultKey];
  }
  
  console.log(`Schema cache invalidated for ${nodeId} with sheet "${sheetName || 'all sheets'}" in workflow ${workflowId}`);
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

/**
 * Get all cached schemas for a workflow
 */
export async function getWorkflowCachedSchemas(
  workflowId: string
): Promise<Record<string, SchemaColumn[]>> {
  const prefix = `schema:${workflowId}:`;
  const result: Record<string, SchemaColumn[]> = {};
  
  Object.keys(schemaCache).forEach(key => {
    if (key.startsWith(prefix)) {
      const parts = key.split(':');
      if (parts.length >= 4) {
        const nodeId = parts[2];
        const schema = schemaCache[key].schema;
        result[nodeId] = schema;
      }
    }
  });
  
  return result;
}

/**
 * Copy schema cache from source node to target node
 */
export async function copySchemaCache(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  options?: {
    sheetName?: string;
    source?: "propagation";
  }
): Promise<boolean> {
  const sourceKey = getCacheKey(workflowId, sourceNodeId, options);
  const sourceCache = schemaCache[sourceKey];
  
  if (!sourceCache) return false;
  
  const targetKey = getCacheKey(workflowId, targetNodeId, options);
  
  schemaCache[targetKey] = {
    schema: sourceCache.schema,
    timestamp: Date.now(),
    sheetName: options?.sheetName || sourceCache.sheetName,
    source: options?.source || "propagation",
    version: sourceCache.version,
    isTemporary: sourceCache.isTemporary,
    fileId: sourceCache.fileId
  };
  
  return true;
}
