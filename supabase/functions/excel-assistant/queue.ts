
// Queue helper for Excel Assistant edge function
import { createClient } from "https://esm.sh/@upstash/redis@1.26.1";

// Environment variables
const UPSTASH_REDIS_REST_URL = Deno.env.get('UPSTASH_REDIS_REST_URL');
const UPSTASH_REDIS_REST_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

// Check if Upstash Redis is configured
const isUpstashConfigured = UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN;

// Initialize Redis client if configured
const redis = isUpstashConfigured 
  ? createClient({
      url: UPSTASH_REDIS_REST_URL,
      token: UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

// Queue a message for processing
export async function queueMessage(params: {
  messageId: string;
  query: string;
  userId: string;
  sessionId: string;
  fileIds?: string[];
  isTextOnly?: boolean;
}): Promise<{ success: boolean; jobId?: string; fallback?: boolean; error?: string }> {
  try {
    // If Redis is not configured, return fallback mode
    if (!redis) {
      console.log('Upstash Redis not configured, cannot queue message');
      return { success: false, fallback: true, error: 'Redis not configured' };
    }
    
    console.log(`Queueing message ${params.messageId} for processing`);
    
    // Create job data
    const jobId = `${params.messageId}:${Date.now()}`;
    const jobData = {
      ...params,
      isTextOnly: params.isTextOnly || !params.fileIds || params.fileIds.length === 0,
      queuedAt: Date.now()
    };
    
    // Add to waiting list
    await redis.lpush('message-processing:waiting', jobId);
    
    // Store job data
    await redis.set(`message-processing:${jobId}`, JSON.stringify(jobData));
    
    console.log(`Successfully queued message ${params.messageId} with job ID ${jobId}`);
    
    return { success: true, jobId };
  } catch (error) {
    console.error('Error queueing message:', error);
    return { success: false, error: error.message, fallback: true };
  }
}

// Check if a message is in the queue
export async function isMessageQueued(messageId: string): Promise<boolean> {
  try {
    if (!redis) return false;
    
    // Get all waiting jobs
    const waitingJobs = await redis.lrange('message-processing:waiting', 0, -1);
    
    // Check if any job starts with messageId:
    return waitingJobs.some(jobId => jobId.startsWith(`${messageId}:`));
  } catch (error) {
    console.error('Error checking if message is queued:', error);
    return false;
  }
}
