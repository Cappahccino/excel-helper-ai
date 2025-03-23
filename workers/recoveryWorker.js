const Redis = require('ioredis');
const { createClient } = require('@supabase/supabase-js');
const { Queue } = require('bullmq');
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

// Initialize message queue
const messageQueue = new Queue('message-processing', { connection: redis });

// Configuration
const STUCK_MESSAGE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const WORKER_HEARTBEAT_THRESHOLD = 60 * 1000; // 1 minute

async function checkWorkerHealth() {
  try {
    const lastHeartbeat = await redis.get('message_worker_heartbeat');
    if (!lastHeartbeat) {
      console.log('No worker heartbeat found');
      return false;
    }

    const timeSinceHeartbeat = Date.now() - parseInt(lastHeartbeat);
    const isWorkerHealthy = timeSinceHeartbeat < WORKER_HEARTBEAT_THRESHOLD;
    
    if (!isWorkerHealthy) {
      console.log(`Worker appears unhealthy. Last heartbeat was ${timeSinceHeartbeat}ms ago`);
    }
    
    return isWorkerHealthy;
  } catch (error) {
    console.error('Error checking worker health:', error);
    return false;
  }
}

async function recoverStuckMessages() {
  console.log('Checking for stuck messages...');
  
  try {
    // Get messages stuck in processing state
    const { data: stuckMessages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('status', 'processing')
      .lt('updated_at', new Date(Date.now() - STUCK_MESSAGE_THRESHOLD).toISOString());
      
    if (error) {
      console.error('Error fetching stuck messages:', error);
      return;
    }
    
    if (!stuckMessages?.length) {
      console.log('No stuck messages found');
      return;
    }
    
    console.log(`Found ${stuckMessages.length} stuck messages`);
    
    // Check if main worker is healthy
    const isWorkerHealthy = await checkWorkerHealth();
    
    for (const message of stuckMessages) {
      console.log(`Processing stuck message ${message.id}`);
      
      try {
        // If worker is unhealthy, requeue the message
        if (!isWorkerHealthy) {
          const job = {
            id: message.id,
            data: {
              messageId: message.id,
              query: message.content,
              userId: message.user_id,
              sessionId: message.session_id,
              fileIds: message.metadata?.file_ids || [],
              isTextOnly: !message.metadata?.file_ids?.length,
              attempts: 0,
              maxAttempts: 3
            }
          };
          
          await redis.lpush('message-processing', JSON.stringify(job));
          
          await supabase
            .from('chat_messages')
            .update({
              status: 'queued',
              metadata: {
                ...message.metadata,
                processing_stage: {
                  stage: 'requeued',
                  requeued_at: new Date().toISOString(),
                  reason: 'Message stuck in processing'
                }
              }
            })
            .eq('id', message.id);
            
          console.log(`Requeued stuck message ${message.id}`);
        } else {
          // If worker is healthy but message is stuck, mark as failed
          await supabase
            .from('chat_messages')
            .update({
              status: 'failed',
              metadata: {
                ...message.metadata,
                processing_stage: {
                  stage: 'failed',
                  failed_at: new Date().toISOString(),
                  reason: 'Message stuck in processing'
                }
              }
            })
            .eq('id', message.id);
            
          console.log(`Marked stuck message ${message.id} as failed`);
        }
      } catch (error) {
        console.error(`Error recovering stuck message ${message.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in recovery process:', error);
  }
}

// Run recovery process every minute
const recoveryInterval = setInterval(recoverStuckMessages, 60000);

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down recovery worker...');
  clearInterval(recoveryInterval);
  await redis.quit();
  console.log('Recovery worker shutdown complete');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('Recovery worker started');

// Run initial check
recoverStuckMessages(); 