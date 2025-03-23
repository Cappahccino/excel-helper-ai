
// Queue helper for Excel Assistant edge function
import { createClient } from "https://esm.sh/@upstash/redis@1.26.1/deno";

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

// Retrieve a specific job by ID
export async function getJob(jobId: string): Promise<any | null> {
  try {
    if (!redis) return null;
    
    const jobData = await redis.get(`message-processing:${jobId}`);
    if (!jobData) return null;
    
    return JSON.parse(jobData);
  } catch (error) {
    console.error('Error getting job:', error);
    return null;
  }
}

// Mark a job as completed
export async function completeJob(jobId: string): Promise<boolean> {
  try {
    if (!redis) return false;
    
    // Remove from waiting list
    await redis.lrem('message-processing:waiting', 0, jobId);
    
    // Add to completed list
    await redis.lpush('message-processing:completed', jobId);
    
    // Set expiry for completed job (24 hours)
    await redis.expire(`message-processing:${jobId}`, 86400);
    
    return true;
  } catch (error) {
    console.error('Error completing job:', error);
    return false;
  }
}

// Mark a job as failed
export async function failJob(jobId: string, error: string): Promise<boolean> {
  try {
    if (!redis) return false;
    
    // Get existing job data
    const jobDataStr = await redis.get(`message-processing:${jobId}`);
    if (!jobDataStr) return false;
    
    const jobData = JSON.parse(jobDataStr);
    
    // Update with error information
    jobData.failed = true;
    jobData.error = error;
    jobData.failedAt = Date.now();
    
    // Save updated job data
    await redis.set(`message-processing:${jobId}`, JSON.stringify(jobData));
    
    // Remove from waiting list
    await redis.lrem('message-processing:waiting', 0, jobId);
    
    // Add to failed list
    await redis.lpush('message-processing:failed', jobId);
    
    // Set expiry for failed job (72 hours)
    await redis.expire(`message-processing:${jobId}`, 259200);
    
    return true;
  } catch (error) {
    console.error('Error failing job:', error);
    return false;
  }
}

// Get next job from the queue
export async function getNextJob(): Promise<{ jobId: string; data: any } | null> {
  try {
    if (!redis) return null;
    
    // Get next job ID from waiting list
    const jobId = await redis.rpop('message-processing:waiting');
    if (!jobId) return null;
    
    // Get job data
    const jobDataStr = await redis.get(`message-processing:${jobId}`);
    if (!jobDataStr) return null;
    
    return {
      jobId,
      data: JSON.parse(jobDataStr)
    };
  } catch (error) {
    console.error('Error getting next job:', error);
    return null;
  }
}
