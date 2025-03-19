
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
