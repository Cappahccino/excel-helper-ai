
// Re-export all schema cache functionality from the modular structure
export * from './types';
export * from './cacheStore';
export * from './cacheWrite';
export * from './cacheRead';
export * from './cacheInvalidate';

// Add backward compatibility aliases for functions that may be imported with old names
import { cacheSchema } from './cacheWrite';
import { getSchemaFromCache, getSchemaMetadataFromCache, isValidCacheExistsAsync } from './cacheRead';

// Export aliases to maintain backward compatibility with existing code
export { 
  cacheSchema as writeSchemaToCache,
  getSchemaFromCache,
  getSchemaMetadataFromCache,
  isValidCacheExistsAsync
};
