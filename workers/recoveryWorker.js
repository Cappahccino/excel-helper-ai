const { Worker, Queue } = require("bullmq");
const Redis = require("ioredis");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Initialize Redis and Supabase clients
const redis = new Redis(process.env.REDIS_URL);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Create recovery queue
const recoveryQueue = new Queue("recovery-processing", { connection: redis });

// Recovery worker to detect and fix stuck messages
const recoveryWorker = new Worker(
  "recovery-processing",
  async (job) => {
    console.log('Running message recovery job');
    
    const MAX_PROCESSING_TIME = 15 * 60 * 1000; // 15 minutes
    const now = Date.now();
    
    // Find messages stuck in processing
    const { data: stuckMessages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('status', 'processing')
      .lt('created_at', new Date(now - MAX_PROCESSING_TIME).toISOString());
      
    if (error) {
      console.error('Error finding stuck messages:', error);
      throw error;
    }
    
    console.log(`Found ${stuckMessages?.length || 0} stuck messages`);
    
    // Process each stuck message
    for (const message of (stuckMessages || [])) {
      console.log(`Recovering stuck message: ${message.id}`);
      
      try {
        // Check if the message has a processing_stage and if it's too old
        const processingStage = message.metadata?.processing_stage;
        const lastUpdated = processingStage?.last_updated || 0;
        
        if (now - lastUpdated > MAX_PROCESSING_TIME) {
          // Update status to failed
          await supabase
            .from('chat_messages')
            .update({
              status: 'failed',
              content: message.content || 'Message processing timed out. Please try again.',
              metadata: {
                ...(message.metadata || {}),
                processing_stage: {
                  ...(processingStage || {}),
                  stage: 'failed',
                  error: 'Processing timed out',
                  recovered_at: now
                }
              }
            })
            .eq('id', message.id);
            
          console.log(`Marked message ${message.id} as failed due to timeout`);
          
          // Add the message back to the processing queue if it should be retried
          if (message.metadata?.retry_count < 3) {
            await messageQueue.add('retry-message', {
              messageId: message.id,
              query: message.content,
              userId: message.user_id,
              sessionId: message.session_id,
              fileIds: message.metadata?.file_ids || [],
              isTextOnly: !message.metadata?.file_ids?.length,
              retryCount: (message.metadata?.retry_count || 0) + 1
            });
            console.log(`Requeued message ${message.id} for retry`);
          }
        }
      } catch (innerError) {
        console.error(`Error recovering message ${message.id}:`, innerError);
      }
    }
    
    return { processed: stuckMessages?.length || 0 };
  },
  { connection: redis }
);

// Run recovery job every 5 minutes
const scheduleRecovery = async () => {
  try {
    await recoveryQueue.add('recover-stuck-messages', {}, {
      repeat: {
        every: 5 * 60 * 1000 // 5 minutes
      }
    });
    console.log('Recovery job scheduled');
  } catch (error) {
    console.error('Failed to schedule recovery job:', error);
  }
};

scheduleRecovery();

// Error handling
recoveryWorker.on('failed', (job, error) => {
  console.error(`Recovery job ${job.id} failed:`, error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await recoveryWorker.close();
  await redis.quit();
});

console.log('Recovery worker started'); 