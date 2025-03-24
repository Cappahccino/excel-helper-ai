const Redis = require('ioredis');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Redis and Supabase clients
console.log('Initializing Redis connection...');
const redis = new Redis(process.env.REDIS_URL);

redis.on('connect', () => {
  console.log('Successfully connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Process messages from the queue
async function processMessages() {
  console.log('Starting message processing...');
  
  try {
    // Get next message from queue
    const jobData = await redis.rpop('message-processing');
    
    if (!jobData) {
      // No messages to process
      return;
    }
    
    const job = JSON.parse(jobData);
    console.log('Processing message:', job.id);
    
    // Update message status
    await updateMessageStatus(job.data.messageId, 'processing', '', {
      stage: 'preparing',
      processing_started_at: new Date().toISOString(),
    });
    
    try {
      // Call Excel Assistant edge function
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
        throw new Error(`Excel Assistant failed: ${error}`);
      }

      const result = await response.json();
      
      // Update message with result
      await updateMessageStatus(job.data.messageId, 'completed', result.content || '', {
        stage: 'completed',
        completed_at: new Date().toISOString(),
        ...result.metadata
      });
      
      console.log(`Successfully processed message ${job.data.messageId}`);
    } catch (error) {
      console.error(`Error processing message ${job.data.messageId}:`, error);
      
      // If we haven't exceeded max attempts, put the job back in the queue
      if (job.attempts < job.maxAttempts) {
        job.attempts++;
        await redis.lpush('message-processing', JSON.stringify(job));
        
        await updateMessageStatus(job.data.messageId, 'processing', '', {
          stage: 'retrying',
          error: error.message,
          attempt: job.attempts,
          next_attempt_at: Date.now() + (1000 * Math.pow(2, job.attempts)) // Exponential backoff
        });
      } else {
        // Mark as failed if we've exceeded max attempts
        await updateMessageStatus(job.data.messageId, 'failed', error.message || 'Unknown error', {
          stage: 'failed',
          error_message: error.message || 'Unknown error during processing',
          failed_at: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    console.error('Error in message processing:', error);
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
    await redis.set('message_worker_heartbeat', timestamp);
    console.log(`Updated worker heartbeat: ${new Date(timestamp).toISOString()}`);
  } catch (error) {
    console.error('Failed to update heartbeat:', error);
  }
}, 30000); // Every 30 seconds

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down worker...');
  clearInterval(processInterval);
  clearInterval(heartbeatInterval);
  await redis.quit();
  console.log('Worker shutdown complete');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('Message worker started');
