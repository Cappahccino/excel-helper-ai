
// Re-export all schema cache functionality from the modular structure
export * from './schema';

// For direct backwards compatibility
import { 
  writeSchemaToCache as cacheSchema,
  getSchemaFromCache,
  getSchemaMetadataFromCache,
  isValidCacheExistsAsync 
} from './schema';

// Explicit re-exports for old import statements
export {
  cacheSchema,
  getSchemaFromCache,
  getSchemaMetadataFromCache,
  isValidCacheExistsAsync
};
