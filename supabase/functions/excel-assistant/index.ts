
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
  console.log(`🚀 [${requestId}] New request received`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();

  try {
    const body = await req.json() as RequestBody;
    console.log(`📝 [${requestId}] Request body:`, body);

    if (!body.userId || !body.query) {
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
    const session = await getOrCreateSession(supabase, userId, sessionId, fileId);
    const excelData = fileId ? await processExcelFile(supabase, fileId) : null;
    const message = await createInitialMessage(supabase, userId, session.session_id, fileId);

    try {
      let threadId = session.thread_id;
      
      // Create a new thread only if one doesn't exist
      if (!threadId) {
        const thread = await openai.beta.threads.create();
        threadId = thread.id;
        await updateSession(supabase, session.session_id, { thread_id: threadId });
      }

      // Get previous messages for context
      const previousMessages = await getThreadMessages(openai, threadId);
      console.log(`📜 [${requestId}] Previous messages count:`, previousMessages.length);

      const excelContext = excelData 
        ? `Excel file context: ${JSON.stringify(excelData)}\n\n`
        : '';

      const threadMessage = await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: `${excelContext}${query}`
      });

      // Create a run with modified instructions that encourage context usage
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        instructions: "Please provide a response that takes into account the conversation history and context when relevant. For follow-up questions, refer to previous exchanges to maintain continuity."
      });

      await supabase
        .from('chat_messages')
        .update({ 
          thread_message_id: threadMessage.id,
          openai_run_id: run.id
        })
        .eq('id', message.id);

      const updateMessageCallback = async (content: string, isComplete: boolean) => {
        await updateStreamingMessage(supabase, message.id, content, isComplete);
      };

      const finalContent = await streamAssistantResponse(
        openai,
        threadId,
        run.id,
        updateMessageCallback
      );

      await updateSession(supabase, session.session_id, { 
        last_run_id: run.id,
        excel_file_id: fileId || session.excel_file_id,
        assistant_id: assistantId
      });

      const response: MessageResponse = {
        message: finalContent,
        messageId: message.id,
        sessionId: session.session_id
      };

      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (streamError) {
      console.error(`Stream error:`, streamError);
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
