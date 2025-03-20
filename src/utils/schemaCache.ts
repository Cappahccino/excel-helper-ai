// Re-export all schema cache functionality from the modular structure
export * from './schema';

// For backwards compatibility, alias invalidateSchemaCache to invalidateWorkflowSchemaCache
import { invalidateSchemaCache } from './schema';
export const invalidateWorkflowSchemaCache = invalidateSchemaCache;

// No need to re-import or re-implement functions that are already exported from './schema'
// The imports and re-exports that were causing conflicts have been removed
