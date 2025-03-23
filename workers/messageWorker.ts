
// messageWorker.ts
import { Queue, Worker } from 'bullmq';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

dotenv.config();

// Environment checks
if (!process.env.REDIS_URL) {
  console.error('REDIS_URL environment variable is required');
  process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

if (!process.env.FUNCTION_URL) {
  console.error('FUNCTION_URL environment variable is required');
  process.exit(1);
}

// Initialize connections
const redis = new Redis(process.env.REDIS_URL);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Create message processing queue
export const messageQueue = new Queue('message-processing', { 
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5 seconds initial delay
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 100, // Keep last 100 failed jobs
  }
});

// Define message types
interface MessageJob {
  messageId: string;
  query: string;
  userId: string;
  sessionId: string;
  fileIds?: string[];
  isTextOnly?: boolean;
  isRecovery?: boolean;
}

// Function to update message status in Supabase
async function updateMessageStatus(messageId: string, status: string, content = '', metadata: Record<string, any> = {}) {
  try {
    const updates: Record<string, any> = { status };
    
    if (content) {
      updates.content = content;
    }
    
    if (Object.keys(metadata).length > 0) {
      const { data: existingMessage } = await supabase
        .from('chat_messages')
        .select('metadata')
        .eq('id', messageId)
        .single();
      
      updates.metadata = {
        ...existingMessage?.metadata,
        processing_stage: {
          ...(existingMessage?.metadata?.processing_stage || {}),
          ...metadata,
          stage: metadata.stage || status,
          last_updated: Date.now()
        }
      };
    }
    
    const { error } = await supabase
      .from('chat_messages')
      .update(updates)
      .eq('id', messageId);
    
    if (error) {
      console.error(`Error updating message ${messageId} status:`, error);
      throw error;
    }
    
    console.log(`Updated message ${messageId} status to ${status}`);
    return true;
  } catch (error) {
    console.error(`Failed to update message ${messageId} status:`, error);
    throw error;
  }
}

// Process the message asynchronously
async function processMessage(job: { data: MessageJob; id: string }) {
  console.log(`Processing message job ${job.id} for message ${job.data.messageId}`);
  
  try {
    // Update status to processing
    await updateMessageStatus(job.data.messageId, 'processing', '', {
      stage: 'worker_processing',
      worker_job_id: job.id,
      worker_started_at: Date.now()
    });
    
    // Call the Excel Assistant edge function
    const functionUrl = `${process.env.FUNCTION_URL}/excel-assistant`;
    
    console.log(`Calling Excel Assistant function at ${functionUrl}`);
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        messageId: job.data.messageId,
        query: job.data.query,
        userId: job.data.userId,
        sessionId: job.data.sessionId,
        fileIds: job.data.fileIds || [],
        // Set direct processing flag to avoid re-queueing
        directProcessing: true
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Excel Assistant function failed: ${errorData.error || response.statusText}`);
    }
    
    const result = await response.json();
    
    // Handle different response types
    if (result.status === 'completed') {
      // For direct completions (Claude)
      await updateMessageStatus(
        job.data.messageId,
        'completed',
        result.content,
        {
          stage: 'completed',
          completed_at: Date.now(),
          model_used: result.model,
          tokens: result.usage
        }
      );
      
      console.log(`Message ${job.data.messageId} processed successfully`);
      return { status: 'completed', messageId: job.data.messageId };
    } else if (result.status === 'processing') {
      // For async processing (OpenAI)
      // We need to poll for completion
      console.log(`Message ${job.data.messageId} requires polling for completion`);
      
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes with 10 second intervals
      
      while (attempts < maxAttempts) {
        attempts++;
        
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        // Poll for status
        const pollResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            messageId: job.data.messageId,
            action: 'poll'
          })
        });
        
        if (!pollResponse.ok) {
          console.warn(`Polling failed on attempt ${attempts}`);
          continue;
        }
        
        const pollResult = await pollResponse.json();
        
        if (pollResult.status === 'completed') {
          console.log(`Message ${job.data.messageId} completed after polling`);
          return { status: 'completed', messageId: job.data.messageId };
        } else if (pollResult.status === 'failed') {
          throw new Error(`Processing failed: ${pollResult.error}`);
        }
        
        console.log(`Message ${job.data.messageId} still processing (attempt ${attempts}/${maxAttempts})`);
      }
      
      throw new Error(`Timed out waiting for message completion after ${attempts} attempts`);
    } else {
      throw new Error(`Unexpected response status: ${result.status}`);
    }
  } catch (error) {
    console.error(`Error processing message ${job.data.messageId}:`, error);
    
    // Update message status to failed
    await updateMessageStatus(job.data.messageId, 'failed', '', {
      stage: 'worker_error',
      error: error.message,
      failed_at: Date.now()
    });
    
    throw error;
  }
}

// Function to recover orphaned messages
async function recoverOrphanedMessages() {
  try {
    console.log('Checking for orphaned messages...');
    
    // Find messages stuck in processing or queued status for more than 5 minutes
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
    
    const { data: stuckMessages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .in('status', ['processing', 'queued'])
      .lt('created_at', fiveMinutesAgo.toISOString());
    
    if (error) {
      console.error('Error finding orphaned messages:', error);
      return;
    }
    
    if (!stuckMessages || stuckMessages.length === 0) {
      console.log('No orphaned messages found');
      return;
    }
    
    console.log(`Found ${stuckMessages.length} potentially orphaned messages`);
    
    // Process each stuck message
    for (const message of stuckMessages) {
      console.log(`Recovering orphaned message ${message.id}`);
      
      // Check if the message is already in the queue
      const jobs = await messageQueue.getJobs(['active', 'waiting']);
      const isAlreadyQueued = jobs.some(job => 
        job.data && job.data.messageId === message.id
      );
      
      if (isAlreadyQueued) {
        console.log(`Message ${message.id} is already in the queue, skipping`);
        continue;
      }
      
      // Add the message back to the queue
      await messageQueue.add('recover-message', {
        messageId: message.id,
        query: message.content,
        userId: message.user_id,
        sessionId: message.thread_id,
        fileIds: message.file_ids || [],
        isRecovery: true
      }, {
        priority: 10, // Higher priority for recovery
        jobId: `recover-${message.id}-${Date.now()}`
      });
      
      console.log(`Queued recovery job for message ${message.id}`);
      
      // Update status to indicate recovery
      await updateMessageStatus(message.id, 'queued', '', {
        stage: 'recovery_queued',
        recovered_at: Date.now(),
        original_status: message.status
      });
    }
  } catch (error) {
    console.error('Error in recovery process:', error);
  }
}

// Create worker to process jobs
const worker = new Worker('message-processing', processMessage, { 
  connection: redis,
  concurrency: 5, // Process up to 5 messages at once
  limiter: {
    max: 10, // At most 10 jobs
    duration: 60000 // Per minute
  }
});

// Set up worker event handlers
worker.on('completed', job => {
  console.log(`Job ${job.id} completed successfully for message ${job.data.messageId}`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed for message ${job?.data?.messageId}:`, error);
});

// Run the recovery process every 5 minutes
const RECOVERY_INTERVAL = 5 * 60 * 1000; // 5 minutes
setInterval(recoverOrphanedMessages, RECOVERY_INTERVAL);

// Initial recovery run on startup
recoverOrphanedMessages();

console.log('Message processing worker started');
