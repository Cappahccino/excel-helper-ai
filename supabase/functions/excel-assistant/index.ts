
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { validateMessageState, updateMessageState, updateStreamingMessage, completeMessage, failMessage } from './database.ts';
import { OpenAIService } from './assistant.ts';
import { corsHeaders } from './utils.ts';

const corsResponse = new Response('Not allowed', {
  status: 405,
  headers: corsHeaders
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return corsResponse;
  }

  try {
    const { query, fileId, userId, sessionId, messageId, threadId } = await req.json();
    console.log('Received request:', { query, fileId, userId, sessionId, messageId, threadId });

    // Validate the input message state
    const { isValid, message } = await validateMessageState(messageId);
    if (!isValid) {
      throw new Error('Invalid message state');
    }

    // Initialize OpenAI service
    const openai = new OpenAIService();
    
    // Create thread message and run
    const { threadMessage, run } = await openai.createMessageAndRun(threadId, query);
    
    // Update message state with OpenAI IDs and change status to in_progress
    await updateMessageState(messageId, threadMessage.id, run.id);
    
    // Process run steps and update message content
    console.log('Processing run steps for message:', messageId);
    let lastContent = '';
    
    for await (const content of openai.processRunSteps(run.id)) {
      if (content !== lastContent) {
        await updateStreamingMessage(messageId, content);
        lastContent = content;
      }
    }
    
    // Complete the message
    await completeMessage(messageId);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in excel-assistant function:', error);
    
    if (error.message.includes('message state')) {
      return new Response(
        JSON.stringify({ error: 'Invalid message state' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
