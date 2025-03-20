
/**
 * Schema propagation scheduler
 * Manages concurrent schema propagation operations and tracks subscription status
 */

// Track active propagation operations
const activePropagations: Record<string, {
  timestamp: number;
  resolve: (result: boolean) => void;
  workflowId: string;
  sourceId: string;
  targetId: string;
}> = {};

// Track node subscription status
const nodeSubscriptions: Record<string, {
  isSubscribed: boolean;
  hasError: boolean;
  lastUpdated: number;
}> = {};

// Generate a key for tracking propagation operations
function getPropagationKey(workflowId: string, sourceId: string, targetId: string): string {
  return `${workflowId}:${sourceId}:${targetId}`;
}

// Generate a key for tracking node subscriptions
function getNodeKey(workflowId: string, nodeId: string): string {
  return `${workflowId}:${nodeId}`;
}

/**
 * Schedule a schema propagation operation
 * Ensures that only one propagation operation happens at a time for a specific node pair
 */
export function schedulePropagation(
  workflowId: string,
  sourceId: string,
  targetId: string,
  operation: () => Promise<boolean>,
  timeout: number = 10000 // Default 10 seconds
): Promise<boolean> {
  const key = getPropagationKey(workflowId, sourceId, targetId);
  
  // Check if there's already an active propagation
  if (activePropagations[key]) {
    console.log(`Propagation already in progress for ${key}, joining existing operation`);
    
    // Return the existing promise
    return new Promise(resolve => {
      // Update the existing propagation with a new resolver
      const existingProp = activePropagations[key];
      
      // Chain a new resolver to the existing one
      const originalResolve = existingProp.resolve;
      existingProp.resolve = (result) => {
        originalResolve(result);
        resolve(result);
      };
    });
  }
  
  // Create a new propagation
  return new Promise(async (resolve) => {
    // Register the propagation
    activePropagations[key] = {
      timestamp: Date.now(),
      resolve,
      workflowId,
      sourceId,
      targetId
    };
    
    // Set timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      console.warn(`Propagation operation timed out for ${key}`);
      
      // Clean up and resolve with failure
      if (activePropagations[key]) {
        activePropagations[key].resolve(false);
        delete activePropagations[key];
      }
    }, timeout);
    
    try {
      // Execute the operation
      const result = await operation();
      
      // Resolve the promise
      if (activePropagations[key]) {
        activePropagations[key].resolve(result);
        delete activePropagations[key];
      }
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      return result;
    } catch (error) {
      console.error(`Error during propagation for ${key}:`, error);
      
      // Resolve with failure
      if (activePropagations[key]) {
        activePropagations[key].resolve(false);
        delete activePropagations[key];
      }
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      return false;
    }
  });
}

/**
 * Track subscription status for a node
 */
export function trackSubscription(
  workflowId: string,
  nodeId: string,
  isSubscribed: boolean,
  hasError: boolean = false
): void {
  const key = getNodeKey(workflowId, nodeId);
  
  nodeSubscriptions[key] = {
    isSubscribed,
    hasError,
    lastUpdated: Date.now()
  };
}

/**
 * Check if a node is subscribed
 */
export function isNodeSubscribed(workflowId: string, nodeId: string): boolean {
  const key = getNodeKey(workflowId, nodeId);
  return !!nodeSubscriptions[key]?.isSubscribed;
}

/**
 * Check if a node has subscription errors
 */
export function hasNodeSubscriptionError(workflowId: string, nodeId: string): boolean {
  const key = getNodeKey(workflowId, nodeId);
  return !!nodeSubscriptions[key]?.hasError;
}

/**
 * Clean up stale propagation operations and subscriptions
 */
export function cleanupStaleOperations(maxAge: number = 30000): void {
  const now = Date.now();
  
  // Clean up stale propagations
  Object.keys(activePropagations).forEach(key => {
    const propagation = activePropagations[key];
    
    if (now - propagation.timestamp > maxAge) {
      console.warn(`Cleaning up stale propagation for ${key}`);
      propagation.resolve(false);
      delete activePropagations[key];
    }
  });
  
  // Clean up old subscription records
  Object.keys(nodeSubscriptions).forEach(key => {
    const subscription = nodeSubscriptions[key];
    
    if (now - subscription.lastUpdated > maxAge) {
      delete nodeSubscriptions[key];
    }
  });
}

// Run cleanup periodically
setInterval(() => {
  cleanupStaleOperations();
}, 60000); // Every minute
