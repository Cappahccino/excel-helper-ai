
import { getCacheKey, normalizeWorkflowId, deleteSchemaEntry, getSchemaEntriesByPrefix, clearSchemaCache } from './cacheStore';

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
  deleteSchemaEntry(key);
  
  // If no specific sheet was provided, also invalidate the default sheet
  if (!sheetName) {
    const defaultKey = getCacheKey(normalizedWorkflowId, nodeId, { sheetName: 'default' });
    deleteSchemaEntry(defaultKey);
  }
  
  console.log(`Schema cache invalidated for ${nodeId} with sheet "${sheetName || 'all sheets'}" in workflow ${workflowId}`);
}

/**
 * Invalidate all cached schemas
 */
export async function invalidateAllSchemaCaches(): Promise<void> {
  clearSchemaCache();
}

/**
 * Invalidate all schemas for a specific workflow
 */
export async function invalidateWorkflowSchemaCache(
  workflowId: string
): Promise<void> {
  const prefix = `schema:${workflowId}:`;
  const entries = getSchemaEntriesByPrefix(prefix);
  
  Object.keys(entries).forEach(key => {
    deleteSchemaEntry(key);
  });
}
