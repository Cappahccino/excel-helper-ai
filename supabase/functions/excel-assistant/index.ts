
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import OpenAI from 'npm:openai';
import { corsHeaders } from './config.ts';
import { RequestBody, MessageResponse } from './types.ts';
import { getOrCreateAssistant, streamAssistantResponse } from './assistant.ts';
import { processExcelFile } from './excel.ts';
import { 
  createInitialMessage, 
  getSessionContext, 
  updateSession,
  updateStreamingMessage 
} from './database.ts';

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] New request received`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();

  try {
    const body = await req.json() as RequestBody;
    console.log(`📝 [${requestId}] Request body:`, body);

    if (!body.userId || !body.sessionId || !body.query) {
      throw new Error('Missing required fields');
    }

    const { fileId, query, userId, sessionId } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY')
    });

    const assistantId = await getOrCreateAssistant(openai);
    const session = await getSessionContext(supabase, sessionId);
    const excelData = fileId ? await processExcelFile(supabase, fileId) : null;
    const message = await createInitialMessage(supabase, userId, sessionId, fileId);

    try {
      let threadId = session.thread_id;
      
      // Create a new thread if one doesn't exist
      if (!threadId) {
        console.log(`🧵 [${requestId}] Creating new thread for session ${sessionId}`);
        const thread = await openai.beta.threads.create();
        threadId = thread.id;
        
        await updateSession(supabase, sessionId, { 
          thread_id: threadId,
          assistant_id: assistantId
        });
      } else {
        console.log(`🧵 [${requestId}] Using existing thread ${threadId}`);
      }

      const excelContext = excelData 
        ? `Excel file context: ${JSON.stringify(excelData)}\n\n`
        : '';

      console.log(`📤 [${requestId}] Creating message in thread ${threadId}`);
      // Add the new message to the thread
      const threadMessage = await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: `${excelContext}${query}`
      });
      console.log(`✅ [${requestId}] Message created: ${threadMessage.id}`);

      console.log(`🎯 [${requestId}] Creating run with assistant ${assistantId}`);
      // Create a new run with context-aware instructions
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        instructions: `
          You are an expert Excel assistant. Your responses should:
          1. Maintain awareness of the conversation history for context
          2. Specifically focus on answering the most recent question asked
          3. Only reference previous context when it directly relates to the current question
          4. Be clear and concise in your responses
          
          While you can use context from previous messages to better understand the user's needs,
          make sure your response directly addresses their latest query.
        `
      });
      console.log(`✅ [${requestId}] Run created: ${run.id}`);

      console.log(`📝 [${requestId}] Updating message with run details`);
      await supabase
        .from('chat_messages')
        .update({ 
          thread_message_id: threadMessage.id,
          openai_run_id: run.id
        })
        .eq('id', message.id);

      const updateMessageCallback = async (content: string, isComplete: boolean) => {
        console.log(`📤 [${requestId}] Updating message ${message.id} - Complete: ${isComplete}`);
        try {
          await updateStreamingMessage(supabase, message.id, content, isComplete);
          console.log(`✅ [${requestId}] Message update successful`);
        } catch (error) {
          console.error(`❌ [${requestId}] Message update failed:`, error);
          throw error;
        }
      };

      console.log(`⚡ [${requestId}] Starting response stream for run ${run.id}`);
      
      const finalContent = await streamAssistantResponse(
        openai,
        threadId,
        run.id,
        updateMessageCallback
      );

      console.log(`🔄 [${requestId}] Updating session with run details`);
      await updateSession(supabase, sessionId, { 
        last_run_id: run.id,
        excel_file_id: fileId || session.excel_file_id
      });

      const response: MessageResponse = {
        message: finalContent,
        messageId: message.id,
        sessionId
      };

      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (streamError) {
      console.error(`❌ [${requestId}] Stream error:`, streamError);
      controller.abort();
      throw streamError;
    }

  } catch (error) {
    console.error(`❌ [${requestId}] Error:`, error);
    controller.abort();
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        requestId
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
