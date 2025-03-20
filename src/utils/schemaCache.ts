
// Re-export all schema cache functionality from the modular structure
export * from './schema';

// For backwards compatibility, alias invalidateSchemaCache to invalidateWorkflowSchemaCache
import { invalidateSchemaCache } from './schema';
export const invalidateWorkflowSchemaCache = invalidateSchemaCache;
