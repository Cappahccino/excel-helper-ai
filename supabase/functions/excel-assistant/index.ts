
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import OpenAI from 'npm:openai';
import { corsHeaders } from './config.ts';
import { RequestBody, MessageResponse } from './types.ts';
import { getOrCreateAssistant, streamAssistantResponse, getThreadMessages } from './assistant.ts';
import { processExcelFile } from './excel.ts';
import { 
  createInitialMessage, 
  getOrCreateSession,
  updateSession,
  updateStreamingMessage 
} from './database.ts';

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] New request received:`, {
    method: req.method,
    url: req.url
  });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();

  try {
    const body = await req.json() as RequestBody;
    console.log(`📝 [${requestId}] Request body:`, {
      userId: body.userId,
      hasFileId: !!body.fileId,
      hasSessionId: !!body.sessionId,
      queryLength: body.query?.length
    });

    if (!body.userId || !body.query) {
      throw new Error('Missing required fields');
    }

    const { fileId, query, userId, sessionId, messageId } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY')
    });

    console.log(`[${requestId}] Getting or creating session`);
    const session = await getOrCreateSession(supabase, userId, sessionId, fileId, requestId);

    console.log(`[${requestId}] Processing Excel file:`, {
      fileId,
      sessionId: session.session_id
    });
    const excelData = fileId ? await processExcelFile(supabase, fileId) : null;

    try {
      let threadId = session.thread_id;
      
      if (!threadId) {
        console.log(`[${requestId}] Creating new thread`);
        const thread = await openai.beta.threads.create();
        threadId = thread.id;
        await updateSession(supabase, session.session_id, { thread_id: threadId }, requestId);
        
        console.log(`[${requestId}] New thread created:`, {
          threadId,
          sessionId: session.session_id
        });
      } else {
        console.log(`[${requestId}] Using existing thread:`, {
          threadId,
          sessionId: session.session_id
        });
      }

      const previousMessages = await getThreadMessages(openai, threadId, requestId);
      console.log(`📜 [${requestId}] Thread context:`, {
        threadId,
        messageCount: previousMessages.length,
        latestMessageId: previousMessages[0]?.id
      });

      const excelContext = excelData 
        ? `Excel file context: ${JSON.stringify(excelData)}\n\n`
        : '';

      console.log(`[${requestId}] Creating thread message`);
      const threadMessage = await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: `${excelContext}${query}`
      });

      console.log(`[${requestId}] Thread message created:`, {
        messageId: threadMessage.id,
        threadId,
        role: threadMessage.role,
        createdAt: threadMessage.created_at
      });

      console.log(`[${requestId}] Creating assistant run`);
      const assistantId = await getOrCreateAssistant(openai, requestId);
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        instructions: "Please provide a response that takes into account the conversation history and context when relevant. For follow-up questions, refer to previous exchanges to maintain continuity."
      });

      console.log(`[${requestId}] Run created:`, {
        runId: run.id,
        threadId,
        assistantId,
        status: run.status
      });

      if (messageId) {
        await supabase
          .from('chat_messages')
          .update({ 
            thread_message_id: threadMessage.id,
            openai_run_id: run.id
          })
          .eq('id', messageId);
      }

      const updateMessageCallback = async (content: string, isComplete: boolean) => {
        if (messageId) {
          await updateStreamingMessage(supabase, messageId, content, isComplete, requestId);
        }
      };

      const finalContent = await streamAssistantResponse(
        openai,
        threadId,
        run.id,
        requestId,
        updateMessageCallback
      );

      console.log(`[${requestId}] Processing complete:`, {
        messageId,
        threadId,
        runId: run.id,
        contentLength: finalContent.length
      });

      await updateSession(supabase, session.session_id, { 
        last_run_id: run.id,
        excel_file_id: fileId || session.excel_file_id,
        assistant_id: assistantId
      }, requestId);

      const response: MessageResponse = {
        message: finalContent,
        messageId: messageId || null,
        sessionId: session.session_id
      };

      console.log(`[${requestId}] Sending response:`, {
        messageId,
        sessionId: session.session_id,
        contentLength: finalContent.length
      });

      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (streamError) {
      console.error(`[${requestId}] Stream error:`, {
        error: streamError.message,
        stack: streamError.stack,
        context: {
          messageId,
          threadId: session.thread_id,
          sessionId: session.session_id
        }
      });
      controller.abort();
      throw streamError;
    }

  } catch (error) {
    console.error(`❌ [${requestId}] Request failed:`, {
      error: error.message,
      stack: error.stack,
      context: {
        url: req.url,
        method: req.method
      }
    });
    
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
