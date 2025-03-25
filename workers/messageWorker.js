const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper function to make Upstash Redis REST API calls
async function upstashRedis(command, ...args) {
  console.log(`Executing Redis command: ${command} with args:`, args);
  
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
    console.log(`Redis command result:`, result);
    return result.result;
  } catch (error) {
    console.error(`Redis command error (${command}):`, error);
    throw error;
  }
}

// Process messages from the queue
async function processMessages() {
  console.log('Checking for messages in queue...');
  
  try {
    // Get next message from queue using RPOP
    console.log('Attempting to fetch message from Redis queue...');
    const jobData = await upstashRedis('rpop', 'message-processing');
    
    if (!jobData) {
      console.log('No messages in queue');
      return;
    }
    
    console.log('Raw job data:', jobData);
    let job;
    try {
      // Handle URL-encoded job data
      const decodedData = decodeURIComponent(jobData);
      job = JSON.parse(decodedData);
    } catch (parseError) {
      console.error('Failed to parse job data:', parseError);
      console.error('Invalid job data:', jobData);
      return;
    }

    if (!job.data?.messageId) {
      console.error('Invalid job structure - missing messageId:', job);
      return;
    }

    console.log('Processing job:', {
      id: job.id,
      messageId: job.data.messageId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      hasFiles: job.data.fileIds?.length > 0,
      isTextOnly: job.data.isTextOnly,
      timestamp: new Date(job.timestamp).toISOString()
    });
    
    // Update message status
    await updateMessageStatus(job.data.messageId, 'in_progress', '', {
      stage: 'processing',
      processing_started_at: new Date().toISOString(),
      has_files: job.data.fileIds?.length > 0,
      is_text_only: job.data.isTextOnly
    });
    
    try {
      // Call Excel Assistant edge function
      const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/excel-assistant`;
      console.log(`\nCalling Excel Assistant edge function:`, {
        messageId: job.data.messageId,
        timestamp: new Date().toISOString(),
        url: edgeFunctionUrl,
        requestBody: {
          messageId: job.data.messageId,
          query: job.data.query,
          hasFiles: job.data.fileIds?.length > 0,
          fileCount: job.data.fileIds?.length,
          isTextOnly: job.data.isTextOnly,
          hasContent: !!job.data.content,
          contentLength: job.data.content?.length,
          metadata: job.data.metadata
        }
      });
      
      const startTime = Date.now();
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          ...job.data,
          processingMetadata: {
            queuedAt: job.timestamp,
            processingStartedAt: startTime,
            attempts: job.attempts,
            worker_version: '1.0.0'
          }
        })
      });

      const responseTime = Date.now() - startTime;
      console.log(`Excel Assistant response received:`, {
        messageId: job.data.messageId,
        status: response.status,
        statusText: response.statusText,
        responseTime: `${responseTime}ms`,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Excel Assistant error details:`, {
          messageId: job.data.messageId,
          status: response.status,
          error: errorText,
          timestamp: new Date().toISOString(),
          responseTime,
          headers: Object.fromEntries(response.headers.entries())
        });
        throw new Error(`Excel Assistant failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      console.log(`Excel Assistant success:`, {
        messageId: job.data.messageId,
        responseTime,
        contentLength: result.content?.length || 0,
        hasMetadata: !!result.metadata,
        metadata: {
          ...result.metadata,
          sensitive_fields_removed: true
        },
        timestamp: new Date().toISOString()
      });
      
      // Update message with result
      await updateMessageStatus(job.data.messageId, 'completed', result.content || '', {
        stage: 'completed',
        completed_at: new Date().toISOString(),
        processing_time: responseTime,
        ...result.metadata
      });
      
      console.log(`Successfully processed message ${job.data.messageId}`);
    } catch (error) {
      console.error(`Error processing message:`, {
        messageId: job.data.messageId,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          cause: error.cause
        },
        timestamp: new Date().toISOString(),
        attempt: job.attempts,
        maxAttempts: job.maxAttempts
      });
      
      // If we haven't exceeded max attempts, put the job back in the queue
      if (!job.attempts) job.attempts = 0;
      if (!job.maxAttempts) job.maxAttempts = 3;
      
      if (job.attempts < job.maxAttempts) {
        job.attempts++;
        const backoffDelay = 1000 * Math.pow(2, job.attempts); // Exponential backoff
        console.log(`Retrying message ${job.data.messageId} (attempt ${job.attempts}/${job.maxAttempts}) with ${backoffDelay}ms delay`);
        
        // Re-encode job data for Redis
        await upstashRedis('lpush', 'message-processing', encodeURIComponent(JSON.stringify(job)));
        
        await updateMessageStatus(job.data.messageId, 'in_progress', '', {
          stage: 'retrying',
          error: error.message,
          attempt: job.attempts,
          next_attempt_at: Date.now() + backoffDelay,
          error_details: {
            message: error.message,
            stack: error.stack,
            timestamp: Date.now()
          }
        });
      } else {
        // Mark as failed if we've exceeded max attempts
        console.log(`Message ${job.data.messageId} failed after ${job.attempts} attempts`);
        await updateMessageStatus(job.data.messageId, 'failed', '', {
          stage: 'failed',
          error_message: error.message || 'Unknown error during processing',
          error_details: {
            message: error.message,
            stack: error.stack,
            final_attempt: job.attempts,
            timestamp: Date.now()
          },
          failed_at: new Date().toISOString()
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
    
    if (content !== undefined && content !== null) {
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

// Graceful shutdown
function shutdown() {
  console.log('Shutting down worker...');
  clearInterval(processInterval);
  clearInterval(heartbeatInterval);
  console.log('Worker shutdown complete');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('Message worker started');
