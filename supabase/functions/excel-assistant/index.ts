
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
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 25000); // Set timeout to 25 seconds to ensure we stay within Edge Function limits

  try {
    const body = await req.json() as RequestBody;
    console.log(`📝 [${requestId}] Request body:`, body);

    if (!body.userId || !body.sessionId || !body.query) {
      throw new Error('Missing required fields');
    }

    const { fileId, query, userId, sessionId } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false
        },
        global: {
          fetch: (...args) => {
            const fetchPromise = fetch(...args);
            controller.signal.addEventListener('abort', () => {
              console.log('Aborting fetch request');
            });
            return fetchPromise;
          }
        }
      }
    );

    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY'),
      fetch: (url: string, init?: RequestInit) => {
        const fetchPromise = fetch(url, {
          ...init,
          signal: controller.signal
        });
        return fetchPromise;
      }
    });

    console.log(`🔑 [${requestId}] Clients initialized`);

    const assistantId = await getOrCreateAssistant(openai);
    console.log(`👨‍💼 [${requestId}] Assistant ID: ${assistantId}`);

    const session = await getSessionContext(supabase, sessionId);
    console.log(`📄 [${requestId}] Session context retrieved`);

    const excelData = fileId ? await processExcelFile(supabase, fileId) : null;
    console.log(`📊 [${requestId}] Excel data processed:`, !!excelData);

    const message = await createInitialMessage(supabase, userId, sessionId, fileId);
    console.log(`💬 [${requestId}] Initial message created: ${message.id}`);

    try {
      let threadId = session.thread_id;
      
      if (!threadId) {
        console.log(`🧵 [${requestId}] Creating new thread`);
        const thread = await openai.beta.threads.create();
        threadId = thread.id;
        
        await updateSession(supabase, sessionId, { 
          thread_id: threadId,
          assistant_id: assistantId
        });
      }

      const excelContext = excelData 
        ? `Excel file context: ${JSON.stringify(excelData)}\n\n`
        : '';

      console.log(`📤 [${requestId}] Creating message in thread`);
      const threadMessage = await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: `${excelContext}${query}`
      });

      console.log(`🎯 [${requestId}] Creating run`);
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        instructions: `
          You are an expert Excel assistant. Your responses should:
          1. Maintain awareness of the conversation history for context
          2. Specifically focus on answering the most recent question asked
          3. Only reference previous context when it directly relates to the current question
          4. Be clear and concise in your responses
        `
      });

      await supabase
        .from('chat_messages')
        .update({ 
          thread_message_id: threadMessage.id,
          openai_run_id: run.id
        })
        .eq('id', message.id);

      const updateMessageCallback = async (content: string, isComplete: boolean, rawMessage?: any) => {
        try {
          await updateStreamingMessage(supabase, message.id, content, isComplete, rawMessage);
        } catch (error) {
          console.error(`❌ [${requestId}] Message update failed:`, error);
          throw error;
        }
      };

      console.log(`⚡ [${requestId}] Starting response stream`);
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

      clearTimeout(timeoutId);

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
      throw streamError;
    }

  } catch (error) {
    console.error(`❌ [${requestId}] Error:`, error);
    
    clearTimeout(timeoutId);
    
    if (controller.signal.aborted) {
      return new Response(
        JSON.stringify({ 
          error: "Request timed out",
          requestId
        }),
        { 
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

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
