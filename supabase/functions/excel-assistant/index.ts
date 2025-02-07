
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
    model: "gpt-4-turbo",
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
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  
  return workbook.SheetNames.map(sheetName => ({
    sheetName,
    data: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])
  }));
}

async function getOrCreateChatSession(supabase: any, userId: string, threadId: string | null, fileId: string) {
  // First try to find an existing session for this file
  const { data: existingSession, error: findError } = await supabase
    .from('chat_sessions')
    .select('session_id, thread_id')
    .eq('file_id', fileId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (findError && findError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
    throw new Error(`Failed to check existing session: ${findError.message}`);
  }

  if (existingSession) {
    console.log('✅ Using existing session:', existingSession.session_id);
    return {
      sessionId: existingSession.session_id,
      threadId: existingSession.thread_id
    };
  }

  // If no existing session, create a new thread and session
  const thread = threadId ? { id: threadId } : await openai.beta.threads.create();
  console.log('✅ Created new thread:', thread.id);

  // Create a new session
  const { data: newSession, error: createError } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: userId,
      thread_id: thread.id,
      file_id: fileId,
      status: 'active'
    })
    .select('session_id')
    .single();

  if (createError) throw new Error(`Failed to create chat session: ${createError.message}`);
  
  console.log('✅ Created new session:', newSession.session_id);
  return {
    sessionId: newSession.session_id,
    threadId: thread.id
  };
}

async function storeChatMessage(
  supabase: any, 
  userId: string, 
  fileId: string, 
  sessionId: string, 
  content: string, 
  role: 'user' | 'assistant',
  isAiResponse = false
) {
  const { error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: userId,
      excel_file_id: fileId,
      session_id: sessionId,
      content,
      role,
      is_ai_response: isAiResponse
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
    const { fileId, query, userId, threadId } = await req.json();
    console.log(`📝 [${requestId}] Processing:`, { fileId, userId, threadId });

    if (!query || !userId || !fileId) {
      throw new Error('Missing required fields');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY')
    });

    // Get or create chat session and OpenAI thread
    const { sessionId, threadId: openaiThreadId } = await getOrCreateChatSession(supabase, userId, threadId, fileId);
    
    // Store user's message
    await storeChatMessage(supabase, userId, fileId, sessionId, query, 'user');

    const assistant = await getOrCreateAssistant(openai);
    const excelData = await getExcelFileContent(supabase, fileId);
    
    // Send message to OpenAI
    await openai.beta.threads.messages.create(openaiThreadId, {
      role: "user",
      content: `Analyze this Excel data:\n${JSON.stringify(excelData)}\n\n${query}`
    });

    // Start the analysis
    const run = await openai.beta.threads.runs.create(openaiThreadId, {
      assistant_id: assistant.id,
    });

    // Monitor the run status
    let runStatus = await openai.beta.threads.runs.retrieve(openaiThreadId, run.id);
    let attempts = 0;
    const maxAttempts = 60;
    
    while (runStatus.status !== "completed" && attempts < maxAttempts) {
      if (runStatus.status === "failed" || runStatus.status === "cancelled") {
        throw new Error(`Run ${runStatus.status}: ${runStatus.last_error?.message || 'Unknown error'}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(openaiThreadId, run.id);
      attempts++;
      console.log(`⏳ Run status: ${runStatus.status} (attempt ${attempts}/${maxAttempts})`);
    }

    if (attempts >= maxAttempts) throw new Error('Analysis timed out');
    
    // Get the assistant's response
    const messages = await openai.beta.threads.messages.list(openaiThreadId);
    const lastMessage = messages.data[0];

    // Store the AI response
    await storeChatMessage(
      supabase,
      userId,
      fileId,
      sessionId,
      lastMessage.content[0].text.value,
      'assistant',
      true
    );

    console.log(`✅ [${requestId}] Analysis complete`);
    return new Response(
      JSON.stringify({ 
        message: lastMessage.content[0].text.value,
        threadId: openaiThreadId,
        sessionId
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
