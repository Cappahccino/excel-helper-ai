/**
 * Schema propagation scheduler 
 * Helps manage and optimize when schema propagation should occur
 */

// Store timestamps of recent propagations
const recentPropagations: Record<string, number> = {};

// Track in-progress propagations
const propagationLocks: Record<string, boolean> = {};

// Default cooldown periods
const DEFAULT_COOLDOWN_MS = 30000; // 30 seconds
const ERROR_COOLDOWN_BASE_MS = 1000; // Base cooldown after error (will use exponential backoff)
const MAX_ERROR_COOLDOWN_MS = 60000; // Max 1 minute backoff

/**
 * Get propagation key from workflow, source and target
 */
export function getPropagationKey(workflowId: string, sourceId: string, targetId: string, sheetName?: string): string {
  const sheet = sheetName || 'default';
  return `${workflowId}:${sourceId}:${targetId}:${sheet}`;
}

/**
 * Check if a propagation should be allowed to run now
 * @returns true if propagation should be allowed, false if it should be skipped
 */
export function shouldPropagate(
  workflowId: string, 
  sourceId: string, 
  targetId: string, 
  options?: {
    sheetName?: string;
    forcePropagation?: boolean;
    customCooldown?: number;
  }
): boolean {
  const { 
    sheetName, 
    forcePropagation = false,
    customCooldown
  } = options || {};
  
  // Always allow forced propagation
  if (forcePropagation) return true;
  
  const key = getPropagationKey(workflowId, sourceId, targetId, sheetName);
  
  // Check if propagation is currently locked (in progress)
  if (propagationLocks[key]) {
    console.log(`Propagation for ${key} is already in progress, skipping`);
    return false;
  }
  
  // Check if we've propagated recently
  const lastPropagation = recentPropagations[key];
  if (lastPropagation) {
    const elapsed = Date.now() - lastPropagation;
    const cooldown = customCooldown || DEFAULT_COOLDOWN_MS;
    
    if (elapsed < cooldown) {
      console.log(`Skipping propagation for ${key} - last propagation was ${elapsed}ms ago (cooldown: ${cooldown}ms)`);
      return false;
    }
  }
  
  return true;
}

/**
 * Mark propagation as started
 */
export function markPropagationStarted(
  workflowId: string, 
  sourceId: string, 
  targetId: string,
  sheetName?: string
): void {
  const key = getPropagationKey(workflowId, sourceId, targetId, sheetName);
  propagationLocks[key] = true;
}

/**
 * Mark propagation as completed successfully
 */
export function markPropagationSuccess(
  workflowId: string, 
  sourceId: string, 
  targetId: string,
  sheetName?: string
): void {
  const key = getPropagationKey(workflowId, sourceId, targetId, sheetName);
  recentPropagations[key] = Date.now();
  propagationLocks[key] = false;
}

/**
 * Mark propagation as failed
 * @param retryCount Number of retry attempts so far
 * @returns Time in ms to wait before next retry (with exponential backoff)
 */
export function markPropagationError(
  workflowId: string, 
  sourceId: string, 
  targetId: string,
  retryCount: number,
  sheetName?: string
): number {
  const key = getPropagationKey(workflowId, sourceId, targetId, sheetName);
  
  // Using exponential backoff for retries
  const backoff = Math.min(
    ERROR_COOLDOWN_BASE_MS * Math.pow(2, retryCount),
    MAX_ERROR_COOLDOWN_MS
  );
  
  // Record last attempt with current time
  recentPropagations[key] = Date.now();
  
  // Release the lock
  propagationLocks[key] = false;
  
  return backoff;
}

/**
 * Clear propagation history for a specific workflow or key
 */
export function clearPropagationHistory(workflowIdOrKey: string): void {
  // If this is a full key, clear just that entry
  if (workflowIdOrKey.includes(':')) {
    delete recentPropagations[workflowIdOrKey];
    delete propagationLocks[workflowIdOrKey];
    return;
  }
  
  // Otherwise treat as workflow ID and clear all entries for that workflow
  const keysToRemove = Object.keys(recentPropagations).filter(
    key => key.startsWith(`${workflowIdOrKey}:`)
  );
  
  keysToRemove.forEach(key => {
    delete recentPropagations[key];
    delete propagationLocks[key];
  });
}

/**
 * Get propagation stats for debugging
 */
export function getPropagationStats(): {
  activeCount: number;
  totalTracked: number;
  lockedCount: number;
} {
  const totalKeys = Object.keys(recentPropagations).length;
  const lockedKeys = Object.values(propagationLocks).filter(Boolean).length;
  
  return {
    totalTracked: totalKeys,
    lockedCount: lockedKeys,
    activeCount: lockedKeys
  };
}
