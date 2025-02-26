
interface RetryOptions {
  maxRetries?: number;
  delay?: number;
  backoff?: number;
  onRetry?: (error: Error, attempt: number) => void;
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
    onRetry
  } = options;

  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
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
