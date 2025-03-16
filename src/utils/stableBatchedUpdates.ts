
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
  return function(...args: Parameters<T>) {
    requestAnimationFrame(() => {
      fn(...args);
    });
  };
}

/**
 * Creates a throttled function that only executes once per specified interval
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval = 100
): (...args: Parameters<T>) => void {
  let lastExecuted = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>) {
    const now = Date.now();
    const remaining = interval - (now - lastExecuted);
    
    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastExecuted = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastExecuted = Date.now();
        timeoutId = null;
        fn(...args);
      }, remaining);
    }
  };
}
