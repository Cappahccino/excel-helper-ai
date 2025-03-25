const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper function to make Upstash Redis REST API calls
async function upstashRedis(command, ...args) {
  const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/${command}/${args.join('/')}`, {
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`Upstash Redis API error: ${await response.text()}`);
  }

  const result = await response.json();
  return result.result;
}

// Process messages from the queue
async function processMessages() {
  console.log('Checking for messages in queue...');
  
  try {
    // Get next message from queue using RPOP
    console.log('Attempting to fetch message from Redis queue...');
    let jobData;
    try {
      jobData = await upstashRedis('rpop', 'message-processing');
    } catch (redisError) {
      console.error('Error fetching from Redis queue:', {
        error: redisError.message,
        stack: redisError.stack,
        timestamp: Date.now()
      });
      return;
    }
    
    if (!jobData) {
      console.log('No messages in queue');
      return;
    }
    
    console.log('Raw job data:', jobData);
    let job;
    try {
      job = JSON.parse(jobData);
    } catch (parseError) {
      console.error('Failed to parse job data:', {
        error: parseError.message,
        rawData: jobData,
        timestamp: Date.now()
      });
      return;
    }

    console.log('Processing job:', {
      id: job.id,
      messageId: job.data?.messageId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      timestamp: Date.now()
    });
    
    // Update message status
    try {
      console.log(`Updating message ${job.data.messageId} to in_progress status`);
      await updateMessageStatus(job.data.messageId, 'in_progress', '', {
        stage: 'preparing',
        processing_started_at: new Date().toISOString(),
        attempt_number: job.attempts + 1,
        processing_details: {
          worker_id: process.pid,
          started_at: Date.now()
        }
      });
    } catch (statusError) {
      console.error(`Failed to update initial status for message ${job.data.messageId}:`, {
        error: statusError.message,
        stack: statusError.stack,
        timestamp: Date.now()
      });
      // Continue processing since the message is already popped from queue
    }
    
    try {
      // Call Excel Assistant edge function
      console.log(`Calling Excel Assistant for message ${job.data.messageId}`);
      const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/excel-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(job.data)
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`Excel Assistant error response for message ${job.data.messageId}:`, {
          status: response.status,
          statusText: response.statusText,
          error,
          timestamp: Date.now()
        });
        throw new Error(`Excel Assistant failed: ${error}`);
      }

      const result = await response.json();
      console.log(`Excel Assistant success for message ${job.data.messageId}:`, {
        status: 'success',
        contentLength: result.content?.length || 0,
        hasMetadata: !!result.metadata,
        processingTime: Date.now() - job.timestamp
      });
      
      // Update message with result
      console.log(`Updating message ${job.data.messageId} to completed status`);
      await updateMessageStatus(job.data.messageId, 'completed', result.content || '', {
        stage: 'completed',
        completed_at: new Date().toISOString(),
        processing_time_ms: Date.now() - job.timestamp,
        success_details: {
          content_length: result.content?.length || 0,
          has_metadata: !!result.metadata
        },
        ...result.metadata
      });
      
      console.log(`Successfully processed message ${job.data.messageId}`);
    } catch (error) {
      console.error(`Error processing message ${job.data.messageId}:`, {
        error: error.message,
        stack: error.stack,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        timestamp: Date.now()
      });
      
      // If we haven't exceeded max attempts, put the job back in the queue
      if (job.attempts < job.maxAttempts) {
        job.attempts++;
        const backoffDelay = 1000 * Math.pow(2, job.attempts); // Exponential backoff
        console.log(`Retrying message ${job.data.messageId} (attempt ${job.attempts}/${job.maxAttempts}) with ${backoffDelay}ms delay`);
        
        try {
          await upstashRedis('lpush', 'message-processing', JSON.stringify(job));
          
          await updateMessageStatus(job.data.messageId, 'in_progress', '', {
            stage: 'retrying',
            error: error.message,
            attempt: job.attempts,
            next_attempt_at: Date.now() + backoffDelay,
            retry_details: {
              current_attempt: job.attempts,
              max_attempts: job.maxAttempts,
              backoff_delay_ms: backoffDelay,
              error_type: error.name,
              error_message: error.message
            }
          });
        } catch (retryError) {
          console.error(`Failed to queue retry for message ${job.data.messageId}:`, {
            error: retryError.message,
            originalError: error.message,
            timestamp: Date.now()
          });
          // Mark as failed since we couldn't queue the retry
          await updateMessageStatus(job.data.messageId, 'failed', error.message || 'Unknown error', {
            stage: 'failed',
            error_message: `Failed to queue retry: ${retryError.message}`,
            original_error: error.message,
            failed_at: new Date().toISOString()
          });
        }
      } else {
        // Mark as failed if we've exceeded max attempts
        console.log(`Message ${job.data.messageId} failed after ${job.attempts} attempts`);
        await updateMessageStatus(job.data.messageId, 'failed', error.message || 'Unknown error', {
          stage: 'failed',
          error_message: error.message || 'Unknown error during processing',
          failed_at: new Date().toISOString(),
          failure_details: {
            total_attempts: job.attempts,
            final_error: error.message,
            error_type: error.name,
            processing_time_ms: Date.now() - job.timestamp
          }
        });
      }
    }
  } catch (error) {
    console.error('Fatal error in message processing:', {
      error: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });
  }
}

// Track message status with timeouts and heartbeats
async function updateMessageStatus(messageId, status, content, metadata) {
  console.log(`Updating message ${messageId} status to ${status}`);
  try {
    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };
    
    if (content) {
      updateData.content = content;
    }
    
    if (metadata) {
      // Get existing metadata first
      const { data: existingMessage, error: fetchError } = await supabase
        .from('chat_messages')
        .select('metadata')
        .eq('id', messageId)
        .single();
        
      if (fetchError) {
        console.error(`Error fetching existing message ${messageId}:`, fetchError);
      }
      
      const currentMetadata = existingMessage?.metadata || {};
      
      updateData.metadata = {
        ...currentMetadata,
        processing_stage: {
          ...(currentMetadata.processing_stage || {}),
          ...metadata,
          last_updated: Date.now()
        },
        worker_heartbeat: Date.now()
      };
    }
    
    const { error: updateError } = await supabase
      .from('chat_messages')
      .update(updateData)
      .eq('id', messageId);
      
    if (updateError) {
      console.error(`Error updating message status for ${messageId}:`, updateError);
    } else {
      console.log(`Successfully updated message ${messageId} status`);
    }
  } catch (error) {
    console.error(`Fatal error updating message status for ${messageId}:`, error);
  }
}

// Process messages continuously
const processInterval = setInterval(processMessages, 1000); // Check every second

// Heartbeat to keep track of worker health
const heartbeatInterval = setInterval(async () => {
  try {
    const timestamp = Date.now();
    await upstashRedis('set', 'message_worker_heartbeat', timestamp);
    console.log(`Updated worker heartbeat: ${new Date(timestamp).toISOString()}`);
  } catch (error) {
    console.error('Failed to update heartbeat:', error);
  }
}, 30000); // Every 30 seconds

// Cleanup job to handle stuck messages
async function cleanupStuckMessages() {
  console.log('Running cleanup job for stuck messages...');
  
  try {
    const STUCK_MESSAGE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    const MAX_RETRY_AGE = 30 * 60 * 1000; // 30 minutes
    const now = new Date().toISOString();
    
    // Find stuck messages
    const { data: stuckMessages, error: fetchError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('status', 'in_progress')
      .lt('updated_at', new Date(Date.now() - STUCK_MESSAGE_THRESHOLD).toISOString());
      
    if (fetchError) {
      console.error('Error fetching stuck messages:', fetchError);
      return;
    }
    
    console.log(`Found ${stuckMessages?.length || 0} potentially stuck messages`);
    
    for (const message of (stuckMessages || [])) {
      const metadata = message.metadata || {};
      const processingStage = metadata.processing_stage || {};
      const lastHeartbeat = metadata.worker_heartbeat;
      const lastAttempt = processingStage.next_attempt_at;
      
      // Check if message is truly stuck
      const isStuck = (
        !lastHeartbeat || 
        Date.now() - lastHeartbeat > STUCK_MESSAGE_THRESHOLD ||
        (lastAttempt && Date.now() - lastAttempt > MAX_RETRY_AGE)
      );
      
      if (isStuck) {
        console.log(`Handling stuck message ${message.id}:`, {
          lastHeartbeat,
          lastAttempt,
          currentStage: processingStage.stage
        });
        
        // Update message status to failed
        await updateMessageStatus(message.id, 'failed', '', {
          stage: 'failed',
          error_message: 'Message processing exceeded timeout',
          failed_at: now,
          original_stage: processingStage.stage,
          last_heartbeat: lastHeartbeat,
          last_attempt: lastAttempt
        });
        
        // Remove from Redis queue if present
        try {
          const queueContent = await upstashRedis('lrange', 'message-processing', '0', '-1');
          const queueItems = queueContent.map(item => JSON.parse(item));
          const messageIndex = queueItems.findIndex(item => item.id === message.id);
          
          if (messageIndex !== -1) {
            console.log(`Removing stuck message ${message.id} from Redis queue`);
            await upstashRedis('lrem', 'message-processing', '1', JSON.stringify(queueItems[messageIndex]));
          }
        } catch (redisError) {
          console.error(`Error cleaning up Redis queue for message ${message.id}:`, redisError);
        }
      }
    }
  } catch (error) {
    console.error('Error in cleanup job:', error);
  }
}

// Run cleanup job every minute
const cleanupInterval = setInterval(cleanupStuckMessages, 60000);

// Add cleanup interval to shutdown
function shutdown() {
  console.log('Shutting down worker...');
  clearInterval(processInterval);
  clearInterval(heartbeatInterval);
  clearInterval(cleanupInterval);
  console.log('Worker shutdown complete');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('Message worker started');
