
/**
 * Utilities for stable, batched updates that prevent flickering in React 
 * when multiple state updates happen at once
 */

/**
 * Debounces a function execution with the specified delay
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay = 50
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return function(...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Batches multiple state updates into a single update using requestAnimationFrame
 * to ensure they happen in the same browser paint cycle
 */
export function batchWithRAF<T extends (...args: any[]) => any>(
  fn: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  
  return function(...args: Parameters<T>) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    
    rafId = requestAnimationFrame(() => {
      fn(...args);
      rafId = null;
    });
  };
}

/**
 * Creates a throttled function that only executes once per specified interval
 * with improved handling to prevent flickering during React Flow operations
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval = 100,
  options: {
    leading?: boolean;
    trailing?: boolean;
    noInitialExecution?: boolean;
  } = {}
): (...args: Parameters<T>) => void {
  const { leading = true, trailing = true, noInitialExecution = false } = options;
  
  let lastExecuted = noInitialExecution ? Date.now() : 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastContext: any = null;
  let isExecuting = false;
  
  // Clear any pending executions
  function cancelPending() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }
  
  // Execute the function with the latest arguments
  function execute() {
    if (!lastArgs) return;
    
    isExecuting = true;
    const now = Date.now();
    lastExecuted = now;
    
    try {
      fn.apply(lastContext, lastArgs);
    } catch (error) {
      console.error("Error in throttled function:", error);
    }
    
    lastArgs = null;
    lastContext = null;
    isExecuting = false;
  }
  
  const throttled = function(this: any, ...args: Parameters<T>) {
    // If already executing, skip scheduling to prevent re-entrancy
    if (isExecuting) return;
    
    // Save context and args for later execution
    lastContext = this;
    lastArgs = args;
    
    const now = Date.now();
    const remaining = interval - (now - lastExecuted);
    
    if (remaining <= 0) {
      // Cancel any pending executions
      cancelPending();
      
      // Execute immediately if leading is enabled
      if (leading) {
        execute();
      }
    } else if (trailing && !timeoutId) {
      // Schedule execution for when the interval has passed
      timeoutId = setTimeout(() => {
        timeoutId = null;
        execute();
      }, remaining);
    }
  };
  
  // Add ability to cancel pending executions
  (throttled as any).cancel = cancelPending;
  
  return throttled;
}
