import { SchemaColumn } from '@/hooks/useNodeManagement';
import { SchemaCacheEntry } from './types';
import { getCacheKey, normalizeWorkflowId, setSchemaEntry } from './cacheStore';

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
  if (!workflowId || !nodeId) {
    console.error('Cannot cache schema with invalid workflowId or nodeId', { workflowId, nodeId });
    return;
  }
  
  try {
    const normalizedWorkflowId = normalizeWorkflowId(workflowId);
    const key = getCacheKey(normalizedWorkflowId, nodeId, options);
    
    const cacheEntry: SchemaCacheEntry = {
      schema,
      timestamp: Date.now(),
      sheetName: options?.sheetName,
      source: options?.source,
      version: options?.version,
      isTemporary: options?.isTemporary || false,
      fileId: options?.fileId
    };
    
    setSchemaEntry(key, cacheEntry);
    
    // Also cache under the default sheet if we're dealing with a sheet-less schema
    // This helps with fallback mechanisms
    if (!options?.sheetName && workflowId && nodeId) {
      const defaultKey = getCacheKey(normalizedWorkflowId, nodeId, { sheetName: 'default' });
      if (defaultKey !== key) {
        setSchemaEntry(defaultKey, {
          ...cacheEntry,
          sheetName: 'default'
        });
      }
    }
    
    // Log cache operation for debugging
    console.log(`Schema cached for ${nodeId} with sheet "${options?.sheetName || 'default'}" in workflow ${workflowId}. Source: ${options?.source}`);
  } catch (error) {
    console.error('Error caching schema:', error);
  }
}

// Export both the original and alias for backward compatibility
export { cacheSchema as writeSchemaToCache };

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
  if (!workflowId || !sourceNodeId || !targetNodeId) {
    console.error('Cannot copy schema cache with invalid parameters', { workflowId, sourceNodeId, targetNodeId });
    return false;
  }
  
  try {
    const normalizedWorkflowId = normalizeWorkflowId(workflowId);
    
    // Try to get schema from the source with the specific sheet first
    const sourceKey = getCacheKey(normalizedWorkflowId, sourceNodeId, options);
    let sourceCache = getSchemaEntry(sourceKey);
    
    // If not found with the specific sheet, try the default one
    if (!sourceCache && options?.sheetName) {
      const defaultSourceKey = getCacheKey(normalizedWorkflowId, sourceNodeId, { sheetName: 'default' });
      sourceCache = getSchemaEntry(defaultSourceKey);
      
      // Still not found, try querying without sheet name at all
      if (!sourceCache) {
        // Try all available schemas for this node
        const nodeSchemaKeys = Object.keys(getSchemaEntriesByPrefix(`schema:${normalizedWorkflowId}:${sourceNodeId}:`));
        
        if (nodeSchemaKeys.length > 0) {
          // Use the first available schema
          sourceCache = getSchemaEntry(nodeSchemaKeys[0]);
          console.log(`Using first available schema for ${sourceNodeId} from ${nodeSchemaKeys[0]}`);
        }
      }
    }
    
    if (!sourceCache) {
      console.log(`No cache found for source node ${sourceNodeId} in workflow ${workflowId}`);
      return false;
    }
    
    const effectiveSheetName = options?.sheetName || sourceCache.sheetName || 'default';
    const targetKey = getCacheKey(normalizedWorkflowId, targetNodeId, { sheetName: effectiveSheetName });
    
    setSchemaEntry(targetKey, {
      schema: sourceCache.schema,
      timestamp: Date.now(),
      sheetName: effectiveSheetName,
      source: options?.source || "propagation",
      version: sourceCache.version,
      isTemporary: sourceCache.isTemporary,
      fileId: sourceCache.fileId
    });
    
    // Also cache under default if not already a default cache
    if (effectiveSheetName !== 'default') {
      const defaultTargetKey = getCacheKey(normalizedWorkflowId, targetNodeId, { sheetName: 'default' });
      setSchemaEntry(defaultTargetKey, {
        ...getSchemaEntry(targetKey)!,
        sheetName: 'default'
      });
    }
    
    console.log(`Copied schema cache from ${sourceNodeId} to ${targetNodeId} with sheet "${effectiveSheetName}"`);
    return true;
  } catch (error) {
    console.error('Error copying schema cache:', error);
    return false;
  }
}

// Imported in cacheWrite.ts but defined in cacheStore.ts
import { getSchemaEntry, getSchemaEntriesByPrefix } from './cacheStore';
