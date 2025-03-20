
// Re-export all schema cache functionality from the modular structure
export * from './schema/index';

// For direct backwards compatibility
import { 
  cacheSchema,
  writeSchemaToCache,
  getSchemaFromCache,
  getSchemaMetadataFromCache,
  isValidCacheExistsAsync,
  trackSuccessfulPropagation,
  wasRecentlyPropagated,
  normalizeWorkflowId,
  invalidateSchemaCache
} from './schema/index';

// Explicit re-exports for old import statements
export {
  cacheSchema,
  writeSchemaToCache,
  getSchemaFromCache,
  getSchemaMetadataFromCache,
  isValidCacheExistsAsync,
  trackSuccessfulPropagation,
  wasRecentlyPropagated,
  normalizeWorkflowId,
  invalidateSchemaCache
};
