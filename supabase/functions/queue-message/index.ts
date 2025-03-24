
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Redis } from "https://deno.land/x/redis@v0.29.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Redis connection details from environment
    const REDIS_URL = Deno.env.get('REDIS_URL');
    if (!REDIS_URL) {
      throw new Error('REDIS_URL not configured');
    }

    // Parse request body
    const { messageId, query, userId, sessionId, fileIds, isTextOnly } = await req.json();

    // Validate required fields
    if (!messageId || !query || !userId || !sessionId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Connect to Redis
    const redis = await Redis.fromURL(REDIS_URL);

    // Add job to queue
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
    };

    // Use Redis list as a queue
    await redis.lpush('message-processing', JSON.stringify(job));
    
    // Update message metadata
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await supabaseClient
      .from('chat_messages')
      .update({
        metadata: {
          processing_stage: {
            stage: 'processing',
            queued_at: Date.now(),
            job_id: messageId
          }
        }
      })
      .eq('id', messageId);

    // Close Redis connection
    await redis.close();

    return new Response(
      JSON.stringify({ success: true, messageId }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error queueing message:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}); 
