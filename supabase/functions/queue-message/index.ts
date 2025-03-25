import { serve } from "std/http/server.ts"
import { createClient } from "@supabase/supabase-js"

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Redis REST API details from environment
    const UPSTASH_REDIS_REST_URL = Deno.env.get('UPSTASH_REDIS_REST_URL')
    const UPSTASH_REDIS_REST_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')

    if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Redis REST API configuration missing')
    }

    // Parse request body
    const { messageId, query, userId, sessionId, fileIds, isTextOnly } = await req.json()

    // Validate required fields
    if (!messageId || !query || !userId || !sessionId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields',
          details: {
            messageId: !messageId,
            query: !query,
            userId: !userId,
            sessionId: !sessionId
          }
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Create job data
    const job = {
      id: messageId,
      data: {
        messageId,
        query,
        userId,
        sessionId,
        fileIds: fileIds || [],
        isTextOnly: isTextOnly || false
      },
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: 3
    }

    try {
      // Add job to queue using Redis REST API
      console.log(`Attempting to queue message ${messageId} to Redis...`);
      const queueResponse = await fetch(`${UPSTASH_REDIS_REST_URL}/lpush/message-processing/${JSON.stringify(job)}`, {
        headers: {
          Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`
        }
      });

      if (!queueResponse.ok) {
        const error = await queueResponse.text();
        console.error('Redis queue error details:', {
          status: queueResponse.status,
          statusText: queueResponse.statusText,
          error,
          messageId: job.id,
          timestamp: Date.now()
        });
        throw new Error(`Failed to queue message: ${error}`);
      }

      console.log(`Successfully queued message ${messageId} to Redis`);
    } catch (queueError) {
      console.error('Error queueing to Redis:', {
        error: queueError.message,
        stack: queueError.stack,
        messageId: job.id,
        timestamp: Date.now(),
        jobData: {
          ...job,
          data: {
            ...job.data,
            query: job.data.query.substring(0, 100) + '...' // Truncate for logging
          }
        }
      });
      
      // Update message status to failed in case of queue error
      try {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') || '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false
            }
          }
        );

        await supabaseClient
          .from('chat_messages')
          .update({
            status: 'failed',
            metadata: {
              processing_stage: {
                stage: 'queue_failed',
                error: queueError.message,
                failed_at: new Date().toISOString(),
                error_details: {
                  name: queueError.name,
                  message: queueError.message,
                  timestamp: Date.now()
                }
              }
            }
          })
          .eq('id', messageId);
      } catch (updateError) {
        console.error('Failed to update message status after queue error:', {
          updateError,
          messageId,
          originalError: queueError.message
        });
      }
      
      throw new Error(`Redis queue error: ${queueError.message}`);
    }
    
    try {
      // Update message metadata in Supabase
      console.log(`Updating message ${messageId} metadata after successful queue...`);
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );

      const { error: updateError } = await supabaseClient
        .from('chat_messages')
        .update({
          status: 'in_progress',
          metadata: {
            processing_stage: {
              stage: 'queued',
              queued_at: Date.now(),
              job_id: messageId,
              queue_details: {
                timestamp: Date.now(),
                initial_attempts: job.attempts,
                max_attempts: job.maxAttempts
              }
            }
          }
        })
        .eq('id', messageId);

      if (updateError) {
        console.error('Error updating message metadata:', {
          error: updateError,
          messageId,
          timestamp: Date.now()
        });
        // Continue anyway since the message is queued
      } else {
        console.log(`Successfully updated metadata for message ${messageId}`);
      }
    } catch (dbError) {
      console.error('Error updating Supabase:', dbError)
      // Continue since message is queued
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId,
        queueTimestamp: Date.now()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error in queue-message function:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        errorType: error.name,
        timestamp: Date.now()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}) 
