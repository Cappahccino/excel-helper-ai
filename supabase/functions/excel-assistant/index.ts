import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import OpenAI from 'npm:openai';
import * as XLSX from 'npm:xlsx';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExcelData {
  sheetName: string;
  data: Record<string, any>[];
}

async function getOrCreateAssistant(openai: OpenAI) {
  const assistants = await openai.beta.assistants.list({ limit: 1, order: "desc" });
  
  if (assistants.data.length > 0) {
    console.log('✅ Using existing assistant:', assistants.data[0].id);
    return assistants.data[0];
  }

  const assistant = await openai.beta.assistants.create({
    name: "Excel Analyst",
    instructions: `You are an Excel data analyst assistant. Your role is to:
      - Analyze Excel data sheet by sheet
      - Provide clear insights and patterns
      - Use numerical evidence
      - Highlight key findings
      - Format responses clearly
      - Maintain context from previous questions to provide more relevant follow-up responses`,
    model: "gpt-4o",
  });

  console.log('✅ Created new assistant:', assistant.id);
  return assistant;
}

async function getExcelFileContent(supabase: any, fileId: string): Promise<ExcelData[]> {
  console.log(`📂 Fetching Excel file ID: ${fileId}`);
  
  const { data: fileData, error: fileError } = await supabase
    .from('excel_files')
    .select('file_path')
    .eq('id', fileId)
    .single();

  if (fileError) throw new Error(`File metadata error: ${fileError.message}`);

  const { data: fileContent, error: downloadError } = await supabase.storage
    .from('excel_files')
    .download(fileData.file_path);

  if (downloadError) throw new Error(`Download error: ${downloadError.message}`);

  const arrayBuffer = await fileContent.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer);
  
  return workbook.SheetNames.map(sheetName => ({
    sheetName,
    data: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])
  }));
}

async function createThread(openai: OpenAI) {
  console.log('🧵 Creating new thread');
  const thread = await openai.beta.threads.create();
  console.log('✅ Thread created:', thread.id);
  return thread;
}

async function fetchMessages(supabase: any, threadId: string) {
  console.log(`📝 Fetching messages for thread: ${threadId}`);
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', threadId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return data;
}

async function handleThreadMessage(openai: OpenAI, content: string, assistant: any, threadId: string | null) {
  let thread;
  if (!threadId) {
    thread = await createThread(openai);
    threadId = thread.id;
  }
  
  console.log(`💬 Creating message in thread ${threadId}`);
  
  // Send message to OpenAI
  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content
  });

  console.log(`🏃 Starting run for thread ${threadId}`);
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistant.id,
  });

  // Monitor run status with timeout
  let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
  let attempts = 0;
  const maxAttempts = 60;
  
  while (runStatus.status !== "completed" && attempts < maxAttempts) {
    if (runStatus.status === "failed" || runStatus.status === "cancelled") {
      throw new Error(`Run ${runStatus.status}: ${runStatus.last_error?.message || 'Unknown error'}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    attempts++;
    console.log(`⏳ Run status: ${runStatus.status} (attempt ${attempts}/${maxAttempts})`);
  }

  if (attempts >= maxAttempts) throw new Error('Analysis timed out');
  
  console.log(`✅ Run completed for thread ${threadId}`);
  const messages = await openai.beta.threads.messages.list(threadId);
  return { messages, threadId };
}

async function storeChatMessage(supabase: any, userId: string, fileId: string, threadId: string, content: string, role: 'user' | 'assistant', isAiResponse = false, additionalData = {}) {
  const { error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: userId,
      excel_file_id: fileId,
      content,
      session_id: threadId,
      role,
      is_ai_response: isAiResponse,
      ...additionalData
    });

  if (error) throw new Error(`Failed to store ${role} message: ${error.message}`);
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] New request received`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const threadId = url.searchParams.get('thread');
      
      if (!threadId) {
        throw new Error('Missing thread ID');
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const messages = await fetchMessages(supabase, threadId);
      return new Response(JSON.stringify({ messages }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { fileId, query, userId, threadId } = await req.json();
    console.log(`📝 [${requestId}] Processing:`, { fileId, userId, threadId });

    if (!fileId || !query || !userId) {
      throw new Error('Missing required fields');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY')
    });

    // Store user's message
    await storeChatMessage(supabase, userId, fileId, threadId, query, 'user');

    const assistant = await getOrCreateAssistant(openai);
    const excelData = await getExcelFileContent(supabase, fileId);
    const { messages, threadId: newThreadId } = await handleThreadMessage(openai, query, assistant, threadId);
    const lastMessage = messages.data[0];

    // Store the AI response
    await storeChatMessage(supabase, userId, fileId, threadId, lastMessage.content[0].text.value, 'assistant', true, {
      openai_model: assistant.model,
      raw_response: lastMessage
    });

    console.log(`✅ [${requestId}] Analysis complete`);
    return new Response(
      JSON.stringify({ 
        message: lastMessage.content[0].text.value,
        threadId: newThreadId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`❌ [${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
