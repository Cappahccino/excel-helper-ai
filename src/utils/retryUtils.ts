
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const retryOperation = async <T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      await wait(delay);
      return retryOperation(operation, retries - 1, delay);
    }
    throw error;
  }
};
