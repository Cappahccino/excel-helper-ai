
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
      const thread = await openai.beta.threads.create();
      const threadId = thread.id;
      
      await updateSession(supabase, sessionId, { 
        thread_id: threadId,
        assistant_id: assistantId
      });

      const excelContext = excelData 
        ? `Excel file context: ${JSON.stringify(excelData)}\n\n`
        : '';

      const threadMessage = await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: `${excelContext}${query}`
      });

      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        instructions: "Focus only on answering the current question. Do not reference or use context from previous messages."
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
