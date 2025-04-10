
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper function to make Upstash Redis REST API calls
async function upstashRedis(command, ...args) {
  try {
    const url = `${process.env.UPSTASH_REDIS_REST_URL}/${command}/${args.join('/')}`;
    console.log(`Redis API request URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Upstash Redis API error (${response.status}):`, error);
      throw new Error(`Upstash Redis API error: ${error}`);
    }

    const result = await response.json();
    return result.result;
  } catch (error) {
    console.error(`Redis command error (${command}):`, error);
    throw error;
  }
}

// Find and recover stuck messages
async function recoverStuckMessages() {
  try {
    console.log('Checking for stuck messages...');
    
    // Find messages that have been stuck in processing for more than 5 minutes
    const { data: stuckMessages, error } = await supabase
      .from('chat_messages')
      .select('id, session_id, metadata')
      .or('status.eq.processing,status.eq.in_progress')
      .lt('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());
    
    if (error) {
      console.error('Error fetching stuck messages:', error);
      return;
    }
    
    console.log(`Found ${stuckMessages?.length || 0} stuck messages`);
    
    if (!stuckMessages || stuckMessages.length === 0) {
      return;
    }
    
    // Check if these messages are in the Redis queue
    for (const message of stuckMessages) {
      console.log(`Checking message ${message.id}...`);
      
      try {
        // Get queue items to check if this message is already queued
        const queueItems = await upstashRedis('lrange', 'message-processing', '0', '-1');
        const isQueued = queueItems?.some(item => {
          try {
            const job = JSON.parse(item);
            return job.id === message.id || job.data?.messageId === message.id;
          } catch (e) {
            return false;
          }
        });
        
        if (isQueued) {
          console.log(`Message ${message.id} is already in the queue, skipping`);
          continue;
        }
        
        // Create a recovery job and add to queue
        console.log(`Recovering message ${message.id}...`);
        
        // Extract any file IDs from the metadata if available
        const fileIds = message.metadata?.file_ids || [];
        
        const job = {
          id: message.id,
          data: {
            messageId: message.id,
            query: message.metadata?.original_query || "Recover this message",
            userId: message.metadata?.user_id,
            sessionId: message.session_id,
            fileIds,
            isTextOnly: fileIds.length === 0
          },
          timestamp: Date.now(),
          attempts: 0,
          maxAttempts: 3,
          isRecovery: true
        };
        
        // Add to queue using lpush to maintain FIFO order with messageWorker.js RPOP
        await upstashRedis('lpush', 'message-processing', JSON.stringify(job));
        
        // Update message status
        await supabase
          .from('chat_messages')
          .update({
            metadata: {
              ...(message.metadata || {}),
              processing_stage: {
                ...(message.metadata?.processing_stage || {}),
                stage: 'recovery_queued',
                recovery_attempt: true,
                recovery_at: Date.now()
              }
            }
          })
          .eq('id', message.id);
        
        console.log(`Message ${message.id} requeued successfully`);
      } catch (messageError) {
        console.error(`Error recovering message ${message.id}:`, messageError);
      }
    }
  } catch (error) {
    console.error('Error in recoverStuckMessages:', error);
  }
}

// Run recovery process immediately and then every 5 minutes
const runRecovery = async () => {
  await recoverStuckMessages();
  setTimeout(runRecovery, 5 * 60 * 1000);
};

console.log('Recovery worker started');
runRecovery();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Recovery worker shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Recovery worker shutting down...');
  process.exit(0);
});
