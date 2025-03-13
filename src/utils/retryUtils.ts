
interface RetryOptions {
  maxRetries?: number;
  delay?: number;
  backoff?: number;
  onRetry?: (error: Error, attempt: number) => void;
  timeout?: number;
  shouldRetry?: (error: Error) => boolean;
}

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const retryOperation = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    delay = 1000,
    backoff = 2,
    onRetry,
    timeout,
    shouldRetry = () => true
  } = options;

  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout if specified
      if (timeout) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
        });
        
        return await Promise.race([operation(), timeoutPromise]);
      }
      
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw error;
      }

      if (onRetry) {
        onRetry(lastError, attempt);
      }

      const waitTime = delay * Math.pow(backoff, attempt - 1);
      await wait(waitTime);
    }
  }

  throw lastError!;
};

export const withTimeout = <T>(promise: Promise<T>, ms: number, errorMessage = 'Operation timed out'): Promise<T> => {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  
  return Promise.race([promise, timeout]);
};
