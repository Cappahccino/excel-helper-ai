import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import OpenAI from 'npm:openai';
import * as XLSX from 'npm:xlsx';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASSISTANT_INSTRUCTIONS = `You are an Excel data analyst assistant. Help users analyze Excel data and answer questions about spreadsheets. 
When data is provided, focus on giving clear insights and explanations. If data seems incomplete or unclear, mention this in your response. 
Focus only on the current question, do not reference previous conversations. When no specific Excel file is provided, provide general Excel advice and guidance.`;

interface ExcelData {
  sheetName: string;
  data: Record<string, any>[];
}

async function getOrCreateAssistant(openai: OpenAI): Promise<string> {
  try {
    const existingAssistantId = Deno.env.get('EXCEL_ASSISTANT_ID');
    if (existingAssistantId) {
      return existingAssistantId;
    }

    const assistant = await openai.beta.assistants.create({
      name: "Excel Analysis Assistant",
      instructions: ASSISTANT_INSTRUCTIONS,
      model: "gpt-4-turbo",
      tools: [{ type: "code_interpreter" }],
    });

    console.log('Created new assistant:', assistant.id);
    return assistant.id;
  } catch (error) {
    console.error('Error getting/creating assistant:', error);
    throw error;
  }
}

async function processExcelFile(supabase: any, fileId: string): Promise<ExcelData[] | null> {
  if (!fileId) return null;
  
  console.log(`📂 Processing file ID: ${fileId}`);
  
  const { data: fileData, error: fileError } = await supabase
    .from('excel_files')
    .select('file_path')
    .eq('id', fileId)
    .single();

  if (fileError) throw new Error(`File metadata error: ${fileError.message}`);
  
  const { data: fileBuffer, error: downloadError } = await supabase.storage
    .from('excel_files')
    .download(fileData.file_path);

  if (downloadError) throw new Error(`File download error: ${downloadError.message}`);

  try {
    const arrayBuffer = await fileBuffer.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    
    const results: ExcelData[] = [];
    
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      const limitedData = jsonData.slice(0, 1000);
      results.push({
        sheetName,
        data: limitedData
      });
    }
    
    return results;
  } catch (error) {
    console.error('Excel processing error:', error);
    throw new Error(`Failed to process Excel file: ${error.message}`);
  }
}

async function updateStreamingMessage(supabase: any, messageId: string, content: string, isComplete: boolean) {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      content,
      is_streaming: !isComplete
    })
    .eq('id', messageId);

  if (error) console.error('Error updating message:', error);
}

async function createInitialMessage(supabase: any, userId: string, sessionId: string, fileId: string | null) {
  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: userId,
      session_id: sessionId,
      excel_file_id: fileId,
      content: '',
      role: 'assistant',
      is_ai_response: true,
      is_streaming: true
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create initial message: ${error.message}`);
  return message;
}

async function getSessionContext(supabase: any, sessionId: string) {
  const { data: session, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error) throw new Error(`Failed to get session context: ${error.message}`);
  return session;
}

const STATUS_POLL_INTERVAL = 500;
const CONTENT_POLL_INTERVAL = 1000;
const MAX_DURATION = 60000;

async function streamAssistantResponse(
  openai: OpenAI, 
  threadId: string, 
  runId: string, 
  supabase: any,
  messageId: string
): Promise<string> {
  let accumulatedContent = "";
  let lastContentCheck = 0;
  let lastMessageId = null;
  let startTime = Date.now();

  while (Date.now() - startTime < MAX_DURATION) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    console.log(`Run status: ${run.status}`);

    const shouldCheckContent =
      run.status === "completed" ||
      (run.status === "in_progress" &&
        Date.now() - lastContentCheck >= CONTENT_POLL_INTERVAL);

    if (shouldCheckContent) {
      lastContentCheck = Date.now();

      const messages = await openai.beta.threads.messages.list(threadId, {
        order: "desc",
        limit: 1
      });

      if (messages.data.length > 0) {
        const message = messages.data[0];
        if (message.role === "assistant" && message.content && message.content[0] && message.content[0].text) {
          accumulatedContent = message.content[0].text.value;
          await updateStreamingMessage(supabase, messageId, accumulatedContent, false);
        }
      }
    }

    if (run.status === "completed") {
      console.log("Assistant response complete.");
      await updateStreamingMessage(supabase, messageId, accumulatedContent, true);
      return accumulatedContent;
    } else if (run.status === "failed" || run.status === "cancelled" || run.status === "expired") {
      throw new Error(`Assistant run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL));
  }

  console.warn("Timeout reached, stopping polling.");
  throw new Error('Response streaming timed out');
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] New request received`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();
  const signal = controller.signal;

  try {
    const body = await req.json();
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
      
      await supabase
        .from('chat_sessions')
        .update({ 
          thread_id: threadId,
          assistant_id: assistantId
        })
        .eq('session_id', sessionId);

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

      const finalContent = await streamAssistantResponse(
        openai,
        threadId,
        run.id,
        supabase,
        message.id
      );

      await supabase
        .from('chat_sessions')
        .update({ 
          last_run_id: run.id,
          excel_file_id: fileId || session.excel_file_id
        })
        .eq('session_id', sessionId);

      return new Response(
        JSON.stringify({ 
          message: finalContent,
          messageId: message.id,
          sessionId
        }),
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
