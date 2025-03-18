
export * from './types';
export * from './cacheStore';

// Re-export with proper naming to maintain backwards compatibility
export { writeSchemaToCache as cacheSchema } from './cacheWrite';
export { persistSchemaToDatabase } from './cacheWrite';
export { readSchemaFromCache as getSchemaFromCache } from './cacheRead';
export { readSchemaMetadataFromCache as getSchemaMetadataFromCache } from './cacheRead';
export { fetchSchemaFromDatabase } from './cacheRead';
export { invalidateSchemaCache } from './cacheInvalidate';
export { invalidateAllSchemaCaches } from './cacheInvalidate';
export { invalidateWorkflowSchemaCache } from './cacheInvalidate';

// Add this utility function that was missing
export const isValidCacheExistsAsync = async (
  workflowId: string,
  nodeId: string,
  options?: {
    sheetName?: string;
    maxAge?: number;
  }
): Promise<boolean> => {
  const cache = await readSchemaFromCache(workflowId, nodeId, options);
  return cache !== null && Array.isArray(cache) && cache.length > 0;
};

// Import here to avoid circular reference
import { readSchemaFromCache } from './cacheRead';
