const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config();

// Environment variable validation
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
];

// Check for missing environment variables
const missingEnvVars = requiredEnvVars.filter(envVar => {
  const value = process.env[envVar];
  if (!value) {
    console.error(`Missing ${envVar} environment variable`);
    return true;
  }
  // Additional validation for URLs
  if (envVar.includes('URL')) {
    try {
      new URL(value);
    } catch (error) {
      console.error(`Invalid URL for ${envVar}: ${value}`);
      return true;
    }
  }
  return false;
});

if (missingEnvVars.length > 0) {
  console.error('Required environment variables are missing or invalid:');
  missingEnvVars.forEach(envVar => console.error(`- ${envVar}`));
  console.error('\nPlease ensure these variables are set in your Supabase Edge Function secrets.');
  process.exit(1);
}

// Initialize Supabase client with validated credentials
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Log successful initialization
console.log('Environment validated and services initialized successfully');
console.log('Worker Configuration:', {
  maxConcurrentJobs: process.env.MAX_CONCURRENT_JOBS || 5,
  maxRetryCount: process.env.MAX_RETRY_COUNT || 3,
  recoveryInterval: process.env.RECOVERY_CHECK_INTERVAL || 300000,
  logLevel: process.env.LOG_LEVEL || 'info',
  debugLogging: process.env.ENABLE_DEBUG_LOGGING === 'true'
});

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
      
      // Prepare request data with all necessary fields
      const requestData = {
        ...job.data,
        processingMetadata: {
          queuedAt: job.timestamp,
          processingStartedAt: Date.now(),
          attempts: job.attempts,
          worker_version: '1.0.0',
          worker_id: process.pid,
          queue_info: {
            original_queue: 'message-processing',
            attempt: job.attempts,
            max_attempts: job.maxAttempts
          }
        }
      };

      // Log detailed request information
      console.log('\n=== Excel Assistant Request Details ===');
      console.log('URL:', edgeFunctionUrl);
      console.log('Headers:', {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <ANON_KEY_PRESENT>',
        'Length': JSON.stringify(requestData).length
      });
      
      // Log the exact request payload
      console.log('\nExact Request Payload:');
      console.log(JSON.stringify({
        messageId: requestData.messageId,
        query: requestData.query,
        userId: requestData.userId,
        sessionId: requestData.sessionId,
        fileIds: requestData.fileIds || [],
        content: requestData.content,
        isTextOnly: requestData.isTextOnly
      }, null, 2));
      
      console.log('\nRequest Metadata:', {
        timestamp: new Date().toISOString(),
        processingMetadata: requestData.processingMetadata
      });
      
      // Make the request with timing
      const startTime = Date.now();
      console.log('\nInitiating Excel Assistant request...');
      
      let response;
      try {
        response = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify(requestData)
        });
      } catch (networkError) {
        console.error('\n=== Excel Assistant Network Error ===');
        console.error('Error Type:', networkError.name);
        console.error('Error Message:', networkError.message);
        console.error('Stack Trace:', networkError.stack);
        console.error('Request URL:', edgeFunctionUrl);
        console.error('Request Data:', {
          messageId: requestData.messageId,
          dataSize: JSON.stringify(requestData).length
        });
        throw networkError;
      }

      const responseTime = Date.now() - startTime;
      
      // Log detailed response information
      console.log('\n=== Excel Assistant Response Details ===');
      console.log('Response Status:', response.status, response.statusText);
      console.log('Response Time:', `${responseTime}ms`);
      console.log('Response Headers:', Object.fromEntries(response.headers.entries()));

      // Handle non-OK responses
      if (!response.ok) {
        const errorText = await response.text();
        console.error('\n=== Excel Assistant Error Response ===');
        console.error('Status:', response.status, response.statusText);
        console.error('Error:', errorText);
        console.error('Headers:', Object.fromEntries(response.headers.entries()));
        console.error('Request Data:', {
          messageId: requestData.messageId,
          query: requestData.query
        });
        console.error('Timing:', {
          queuedAt: new Date(requestData.processingMetadata.queuedAt).toISOString(),
          startedAt: new Date(requestData.processingMetadata.processingStartedAt).toISOString(),
          completedAt: new Date().toISOString(),
          totalTime: responseTime
        });
        
        throw new Error(`Excel Assistant failed (${response.status}): ${errorText}`);
      }

      // Parse and validate response
      let result;
      try {
        const responseText = await response.text();
        console.log('\nRaw Response:', responseText.substring(0, 1000) + (responseText.length > 1000 ? '...' : ''));
        result = JSON.parse(responseText);
        
        // Validate response structure
        if (!result.content && !result.error) {
          throw new Error('Invalid response format: missing content or error');
        }
      } catch (parseError) {
        console.error('\n=== Excel Assistant Response Parse Error ===');
        console.error('Error:', parseError.message);
        console.error('Raw Response:', await response.text());
        throw new Error('Failed to parse Excel Assistant response');
      }

      // Log success details
      console.log('\n=== Excel Assistant Success Details ===');
      console.log('Message ID:', job.data.messageId);
      console.log('Processing Time:', `${responseTime}ms`);
      console.log('Response Size:', JSON.stringify(result).length, 'bytes');
      console.log('Content Preview:', result.content?.substring(0, 100) + (result.content?.length > 100 ? '...' : ''));
      console.log('Metadata Keys:', Object.keys(result.metadata || {}));
      console.log('Timing:', {
        queuedAt: new Date(requestData.processingMetadata.queuedAt).toISOString(),
        startedAt: new Date(requestData.processingMetadata.processingStartedAt).toISOString(),
        completedAt: new Date().toISOString(),
        totalTime: responseTime
      });
      
      // Update message with result
      await updateMessageStatus(job.data.messageId, 'completed', result.content || '', {
        stage: 'completed',
        completed_at: new Date().toISOString(),
        processing_time: responseTime,
        response_size: JSON.stringify(result).length,
        ...result.metadata,
        processing_summary: {
          queue_time: startTime - job.timestamp,
          processing_time: responseTime,
          total_time: Date.now() - job.timestamp,
          attempts: job.attempts,
          worker_info: {
            version: '1.0.0',
            pid: process.pid
          }
        }
      });
      
      console.log(`\nSuccessfully processed message ${job.data.messageId}`);
    } catch (error) {
      console.error('\n=== Excel Assistant Processing Error ===');
      console.error('Message ID:', job.data.messageId);
      console.error('Error Type:', error.name);
      console.error('Error Message:', error.message);
      console.error('Stack Trace:', error.stack);
      console.error('Processing Stage:', {
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        timestamp: new Date().toISOString()
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
