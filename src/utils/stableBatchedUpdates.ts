
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
 * with improved handling to prevent duplicated calls
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval = 100
): (...args: Parameters<T>) => void {
  let lastExecuted = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastContext: any = null;
  
  // Clear any pending executions
  function cancelPending() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }
  
  // Execute the function with the latest arguments
  function execute() {
    if (lastArgs) {
      const now = Date.now();
      lastExecuted = now;
      fn.apply(lastContext, lastArgs);
      lastArgs = null;
      lastContext = null;
    }
  }
  
  const throttled = function(this: any, ...args: Parameters<T>) {
    // Save context and args for later execution
    lastContext = this;
    lastArgs = args;
    
    const now = Date.now();
    const remaining = interval - (now - lastExecuted);
    
    if (remaining <= 0) {
      // Cancel any pending executions
      cancelPending();
      // Execute immediately
      execute();
    } else if (!timeoutId) {
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
