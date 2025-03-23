
import { Queue, Worker, QueueEvents } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// Environment variables
const REDIS_URL = process.env.REDIS_URL!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FUNCTION_URL = process.env.FUNCTION_URL || 'https://saxnxtumstrsqowuwwbt.supabase.co/functions/v1';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Initialize the message queue
export const messageQueue = new Queue('message-processing', {
  connection: {
    host: new URL(REDIS_URL).hostname,
    port: parseInt(new URL(REDIS_URL).port),
    password: new URL(REDIS_URL).password,
    username: new URL(REDIS_URL).username,
    tls: REDIS_URL.startsWith('rediss://')
  },
  defaultJobOptions: {
    attempts: 3,               // Retry up to 3 times
    backoff: {
      type: 'exponential',
      delay: 5000              // Start with 5 seconds, then increase exponentially
    },
    removeOnComplete: true,    // Remove completed jobs
    removeOnFail: false        // Keep failed jobs for inspection
  }
});

// Queue events for monitoring
const queueEvents = new QueueEvents('message-processing', {
  connection: {
    host: new URL(REDIS_URL).hostname,
    port: parseInt(new URL(REDIS_URL).port),
    password: new URL(REDIS_URL).password,
    username: new URL(REDIS_URL).username,
    tls: REDIS_URL.startsWith('rediss://')
  }
});

// Listen for job completed events
queueEvents.on('completed', async ({ jobId }) => {
  console.log(`Job ${jobId} has completed`);
});

// Listen for job failed events
queueEvents.on('failed', async ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} has failed with reason: ${failedReason}`);
  
  // Update message status to failed
  try {
    // Extract the messageId from jobId (format: messageId:timestamp)
    const messageId = jobId.split(':')[0];
    if (messageId) {
      await updateMessageStatusToFailed(messageId, failedReason);
    }
  } catch (error) {
    console.error('Error handling failed job:', error);
  }
});

// Worker to process messages
const worker = new Worker('message-processing', async (job) => {
  const { messageId, query, userId, sessionId, fileIds, isTextOnly } = job.data;
  
  console.log(`Processing message ${messageId}:`, {
    isTextOnly,
    queryLength: query?.length,
    userId,
    sessionId,
    fileCount: fileIds?.length || 0
  });
  
  try {
    // 1. Update message status to show processing has started
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'worker_processing',
      started_at: Date.now(),
      worker_job_id: job.id
    });
    
    // 2. Call the Excel Assistant function to process the message
    console.log(`Calling Excel Assistant for message ${messageId}`);
    const requestData = {
      messageId,
      query,
      userId,
      sessionId,
      fileIds
    };
    
    const response = await fetch(`${FUNCTION_URL}/excel-assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Excel Assistant function failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    // 3. Check the result and update message status
    if (result.success) {
      await updateMessageStatus(messageId, 'completed', result.message || '', {
        stage: 'worker_completed',
        completed_at: Date.now(),
        is_text_only: isTextOnly
      });
      
      console.log(`Successfully processed message ${messageId}`);
      return { success: true, messageId };
    } else {
      throw new Error(result.error || 'Unknown error from Excel Assistant');
    }
  } catch (error) {
    console.error(`Error processing message ${messageId}:`, error);
    
    // 4. Update message status to failed
    await updateMessageStatusToFailed(messageId, error.message);
    
    throw error; // Re-throw to trigger the retry mechanism
  }
}, {
  connection: {
    host: new URL(REDIS_URL).hostname,
    port: parseInt(new URL(REDIS_URL).port),
    password: new URL(REDIS_URL).password,
    username: new URL(REDIS_URL).username,
    tls: REDIS_URL.startsWith('rediss://')
  },
  concurrency: 5, // Process up to 5 messages at once
  limiter: {
    max: 20,       // Maximum number of jobs processed
    duration: 60000 // per minute (ms)
  }
});

// Helper function to update message status
async function updateMessageStatus(
  messageId: string,
  status: string,
  content: string = '',
  metadata: Record<string, any> = {}
) {
  try {
    // Prepare the update payload
    const updates: Record<string, any> = {
      status
    };
    
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
    
    // Update the message
    const { error } = await supabase
      .from('chat_messages')
      .update(updates)
      .eq('id', messageId);
    
    if (error) {
      console.error(`Error updating message ${messageId} status:`, error);
      throw error;
    }
    
    console.log(`Updated message ${messageId} status to ${status}`);
  } catch (error) {
    console.error(`Failed to update message ${messageId} status:`, error);
    throw error;
  }
}

// Helper function to update message status to failed
async function updateMessageStatusToFailed(messageId: string, errorMessage: string) {
  try {
    await updateMessageStatus(messageId, 'failed', 'Processing failed. Please try again.', {
      stage: 'worker_failed',
      error: errorMessage,
      failed_at: Date.now()
    });
    
    console.log(`Marked message ${messageId} as failed`);
  } catch (error) {
    console.error(`Error marking message ${messageId} as failed:`, error);
  }
}

// Setup graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker and queue...');
  await worker.close();
  await messageQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing worker and queue...');
  await worker.close();
  await messageQueue.close();
  process.exit(0);
});

// Export for use in other files
export { worker };

// If this file is run directly, start the worker
if (require.main === module) {
  console.log('Starting message worker...');
  
  // Create a recovery mechanism for orphaned messages
  async function recoverOrphanedMessages() {
    console.log('Checking for orphaned messages...');
    
    try {
      const { data: orphanedMessages, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('status', 'processing')
        .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // 5 minutes ago
      
      if (error) {
        console.error('Error fetching orphaned messages:', error);
        return;
      }
      
      console.log(`Found ${orphanedMessages?.length || 0} orphaned messages`);
      
      if (orphanedMessages && orphanedMessages.length > 0) {
        for (const message of orphanedMessages) {
          console.log(`Recovering orphaned message ${message.id}`);
          
          // Re-queue the message for processing
          if (message.role === 'assistant') {
            // Find the corresponding user message
            const { data: userMessage } = await supabase
              .from('chat_messages')
              .select('*')
              .eq('session_id', message.session_id)
              .eq('role', 'user')
              .lt('created_at', message.created_at)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            
            if (userMessage) {
              // Get file IDs associated with the message
              const { data: messageFiles } = await supabase
                .from('message_files')
                .select('file_id')
                .eq('message_id', userMessage.id);
              
              const fileIds = messageFiles?.map(file => file.file_id) || [];
              
              // Re-queue the message
              await messageQueue.add(
                `recovery:${message.id}:${Date.now()}`,
                {
                  messageId: message.id,
                  query: userMessage.content,
                  userId: message.user_id,
                  sessionId: message.session_id,
                  fileIds,
                  isTextOnly: fileIds.length === 0
                },
                {
                  priority: 10, // Higher priority for recovery
                  attempts: 2   // Fewer retry attempts for recovery
                }
              );
              
              console.log(`Re-queued orphaned message ${message.id}`);
            } else {
              console.log(`Could not find user message for orphaned message ${message.id}`);
              
              // Mark as failed since we can't process without user query
              await updateMessageStatusToFailed(
                message.id, 
                'Recovery failed: Could not find original user query'
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in recovery mechanism:', error);
    }
  }
  
  // Run recovery on startup and then every 5 minutes
  recoverOrphanedMessages();
  setInterval(recoverOrphanedMessages, 5 * 60 * 1000);
}
