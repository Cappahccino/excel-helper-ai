
import { normalizeWorkflowId } from './cacheStore';

/**
 * Invalidate schema cache for a specific node
 * This forces the next schema request to bypass the cache
 */
export async function invalidateSchemaCache(
  workflowId: string, 
  nodeId: string,
  sheetName?: string
): Promise<void> {
  try {
    const normalizedWorkflowId = normalizeWorkflowId(workflowId);
    
    // Create a cache key with or without the sheet name
    const cacheKey = sheetName 
      ? `schema:${normalizedWorkflowId}:${nodeId}:${sheetName}`
      : `schema:${normalizedWorkflowId}:${nodeId}`;
    
    // Clear from localStorage
    if (typeof window !== 'undefined') {
      // Try to invalidate the specific cache key first
      localStorage.removeItem(cacheKey);
      
      // Also clear any cache entries that start with this prefix
      // This handles both sheet-specific and default caches
      const keysToRemove = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`schema:${normalizedWorkflowId}:${nodeId}`)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
    
    console.log(`Invalidated schema cache for ${nodeId} ${sheetName ? `sheet ${sheetName}` : ''}`);
  } catch (error) {
    console.error(`Error invalidating schema cache:`, error);
  }
}
