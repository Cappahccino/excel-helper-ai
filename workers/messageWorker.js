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

// Create message processing queue
const messageQueue = new Queue("message-processing", { connection: redis });

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
    
    console.log(`Processing message ${messageId} for user ${userId}`);
    
    try {
      // Update message status to processing
      await updateMessageStatus(messageId, 'processing', '', {
        stage: 'preparing',
        processing_started_at: new Date().toISOString(),
      });
      
      // Check if we're using Claude or OpenAI
      const USE_CLAUDE = process.env.USE_CLAUDE === 'true';
      
      let result;
      
      // Process with appropriate service
      if (isTextOnly) {
        // Call the Excel Assistant edge function for text-only queries
        result = await callExcelAssistant({
          query,
          messageId,
          userId,
          sessionId,
          fileIds: []
        });
      } else {
        // Call the Excel Assistant edge function with files
        result = await callExcelAssistant({
          query,
          messageId,
          userId,
          sessionId,
          fileIds
        });
      }
      
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
    concurrency: 5, // Process 5 messages at a time
    limiter: {
      max: 10, // Max 10 jobs per time period
      duration: 1000 // 1 second
    }
  }
);

// Helper function to call Excel Assistant edge function
async function callExcelAssistant(data) {
  // Create specialized prompt for text-only queries
  if (data.isTextOnly) {
    const textOnlyPrompt = `
USER QUERY (TEXT-ONLY): ${data.query}

INSTRUCTIONS:
1. This is a text-only query about Excel or data analysis
2. Provide helpful information, tips, and best practices
3. If the query requires file analysis, explain how to use Excel files with this assistant
4. Include examples where appropriate
5. Focus on educational content about Excel features and functions

ADDITIONAL CONTEXT:
- No Excel files are currently attached
- This is part of chat session: ${data.sessionId}
- If file analysis is needed, suggest uploading relevant files
    `.trim();
    
    data.query = textOnlyPrompt;
  }

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
    throw new Error(`Excel Assistant failed: ${error}`);
  }

  return response.json();
}

// Track message status with timeouts and heartbeats
async function updateMessageStatus(messageId, status, content, metadata) {
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
      const { data: existingMessage } = await supabase
        .from('chat_messages')
        .select('metadata')
        .eq('id', messageId)
        .single();
        
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
    
    const { error } = await supabase
      .from('chat_messages')
      .update(updateData)
      .eq('id', messageId);
      
    if (error) {
      console.error(`Error updating message status for ${messageId}:`, error);
    }
  } catch (error) {
    console.error(`Fatal error updating message status for ${messageId}:`, error);
  }
}

// Error handling
messageWorker.on('failed', (job, error) => {
  console.error(`Message job ${job.id} failed:`, error);
});

// Heartbeat to keep track of worker health
setInterval(async () => {
  try {
    await redis.set('message_worker_heartbeat', Date.now());
  } catch (error) {
    console.error('Failed to update heartbeat:', error);
  }
}, 30000); // Every 30 seconds

// Graceful shutdown
process.on('SIGTERM', async () => {
  await messageWorker.close();
  await redis.quit();
});

console.log('Message worker started'); 