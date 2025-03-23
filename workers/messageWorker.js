const { Worker, Queue } = require("bullmq");
const Redis = require("ioredis");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Initialize Redis and Supabase clients
console.log('Attempting to connect to Redis...');
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

// Create message processing queue with debug logging
console.log('Creating message processing queue...');
const messageQueue = new Queue("message-processing", { 
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  }
});

// Worker to process messages
const messageWorker = new Worker(
  "message-processing",
  async (job) => {
    const { 
      messageId, 
      query, 
      userId, 
      sessionId, 
      fileIds, 
      isTextOnly 
    } = job.data;
    
    console.log(`[${new Date().toISOString()}] Processing message ${messageId} for user ${userId}`);
    console.log('Job data:', job.data);
    
    try {
      // Update message status to processing
      console.log(`Updating message ${messageId} status to processing...`);
      await updateMessageStatus(messageId, 'processing', '', {
        stage: 'preparing',
        processing_started_at: new Date().toISOString(),
      });
      
      // Check if we're using Claude or OpenAI
      const USE_CLAUDE = process.env.USE_CLAUDE === 'true';
      console.log(`Using ${USE_CLAUDE ? 'Claude' : 'OpenAI'} for processing`);
      
      let result;
      
      // Process with appropriate service
      if (isTextOnly) {
        console.log(`Processing text-only query for message ${messageId}`);
        // Call the Excel Assistant edge function for text-only queries
        result = await callExcelAssistant({
          query,
          messageId,
          userId,
          sessionId,
          fileIds: []
        });
      } else {
        console.log(`Processing file-based query for message ${messageId} with files:`, fileIds);
        // Call the Excel Assistant edge function with files
        result = await callExcelAssistant({
          query,
          messageId,
          userId,
          sessionId,
          fileIds
        });
      }
      
      console.log(`Successfully processed message ${messageId}, updating status...`);
      // Update message with the result
      await updateMessageStatus(messageId, 'completed', result.content || '', {
        stage: 'completed',
        completed_at: new Date().toISOString(),
        ...result.metadata
      });
      
      return { success: true, messageId };
    } catch (error) {
      console.error(`Error processing message ${messageId}:`, error);
      
      // Update message status to failed
      await updateMessageStatus(messageId, 'failed', error.message || 'Unknown error', {
        stage: 'failed',
        error_message: error.message || 'Unknown error during processing',
        failed_at: new Date().toISOString()
      });
      
      throw error;
    }
  },
  { 
    connection: redis,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000
    }
  }
);

// Helper function to call Excel Assistant edge function
async function callExcelAssistant(data) {
  console.log(`Calling Excel Assistant with data:`, {
    messageId: data.messageId,
    sessionId: data.sessionId,
    isTextOnly: !data.fileIds?.length
  });

  const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/excel-assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Excel Assistant API error (${response.status}):`, error);
    throw new Error(`Excel Assistant failed: ${error}`);
  }

  const result = await response.json();
  console.log(`Excel Assistant response received for message ${data.messageId}`);
  return result;
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
      
      // Add specialized metadata for text-only queries
      if (metadata.is_text_only) {
        metadata.text_only_context = {
          processed_at: Date.now(),
          query_type: 'text_only',
          requires_files: metadata.might_need_files || false
        };
      }
      
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

// Error handling with more detailed logging
messageWorker.on('failed', (job, error) => {
  console.error(`Message job ${job.id} failed:`, error);
  console.error('Job data:', job.data);
  console.error('Error stack:', error.stack);
});

messageWorker.on('completed', (job) => {
  console.log(`Message job ${job.id} completed successfully`);
});

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
  clearInterval(heartbeatInterval);
  await messageWorker.close();
  await redis.quit();
  console.log('Worker shutdown complete');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('Message worker started'); 