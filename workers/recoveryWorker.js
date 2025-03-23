const { createClient } = require('@supabase/supabase-js');
const { Queue } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

// Initialize Redis and Supabase clients
const redis = new Redis(process.env.REDIS_URL);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize message queue
const messageQueue = new Queue('message-processing', { connection: redis });

// Configuration
const STUCK_MESSAGE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL = 60 * 1000; // 1 minute

async function findStuckMessages() {
  console.log('Checking for stuck messages...');
  
  try {
    const now = Date.now();
    const threshold = now - STUCK_MESSAGE_THRESHOLD;
    
    // Find messages that have been processing for too long
    const { data: stuckMessages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('status', 'processing')
      .lt('updated_at', new Date(threshold).toISOString());
      
    if (error) {
      console.error('Error fetching stuck messages:', error);
      return;
    }
    
    if (!stuckMessages?.length) {
      console.log('No stuck messages found');
      return;
    }
    
    console.log(`Found ${stuckMessages.length} stuck messages`);
    
    // Process each stuck message
    for (const message of stuckMessages) {
      console.log(`Processing stuck message ${message.id}`);
      
      try {
        // Check if the message is already in the queue
        const existingJob = await messageQueue.getJob(message.id);
        
        if (existingJob) {
          console.log(`Message ${message.id} is already in the queue, status:`, await existingJob.getState());
          continue;
        }
        
        // Add message back to the queue
        await messageQueue.add(
          'process-message',
          {
            messageId: message.id,
            query: message.content,
            userId: message.user_id,
            sessionId: message.session_id,
            fileIds: message.metadata?.file_ids || [],
            isTextOnly: !message.metadata?.file_ids?.length,
            isRecovery: true
          },
          {
            jobId: message.id,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000
            }
          }
        );
        
        console.log(`Re-queued message ${message.id}`);
        
        // Update message status
        const { error: updateError } = await supabase
          .from('chat_messages')
          .update({
            status: 'queued',
            metadata: {
              ...message.metadata,
              recovery: {
                recovered_at: now,
                original_status: message.status,
                original_metadata: message.metadata
              }
            }
          })
          .eq('id', message.id);
          
        if (updateError) {
          console.error(`Error updating message ${message.id}:`, updateError);
        }
      } catch (error) {
        console.error(`Error processing stuck message ${message.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in findStuckMessages:', error);
  }
}

// Run recovery process periodically
const interval = setInterval(findStuckMessages, CHECK_INTERVAL);

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down recovery worker...');
  clearInterval(interval);
  await redis.quit();
  console.log('Recovery worker shutdown complete');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('Recovery worker started');

// Run initial check
findStuckMessages().catch(console.error); 