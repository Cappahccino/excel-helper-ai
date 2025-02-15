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
    name: "Excel & Data Analyst",
    instructions: `You are a versatile data analysis assistant. Your role is to:
      - Analyze Excel data when provided
      - Answer general data analysis questions
      - Provide clear insights and patterns
      - Use numerical evidence when available
      - Highlight key findings
      - Format your responses using markdown including:
        * Use ## for section headers
        * Use bullet points for lists
        * Use backticks for code or Excel formulas
        * Use tables when presenting structured data
        * Use bold and italic for emphasis
      - Maintain context from previous questions
      - Be helpful even without Excel data`,
    model: "gpt-4-turbo",
  });

  console.log('✅ Created new assistant:', assistant.id);
  return assistant;
}

async function getExcelFileContent(supabase: any, fileId: string): Promise<ExcelData[] | null> {
  if (!fileId) return null;
  
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

async function getOrCreateChatSession(supabase: any, userId: string, fileId: string | null = null, existingThreadId: string | null = null, openai: OpenAI) {
  console.log(`🔍 Checking session for user: ${userId}`);

  if (existingThreadId) {
    // If we have an existing thread ID, get its session
    const { data: existingSession, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('session_id, thread_id')
      .eq('thread_id', existingThreadId)
      .maybeSingle();

    if (sessionError) throw new Error(`Failed to get session: ${sessionError.message}`);

    if (existingSession) {
      console.log('✅ Using existing session:', existingSession.session_id);
      return {
        sessionId: existingSession.session_id,
        threadId: existingSession.thread_id
      };
    }
  }

  // Create a new thread and session
  console.log('Creating new session and thread...');
  const thread = await openai.beta.threads.create();
  console.log('✅ Created new thread:', thread.id);

  // Create a new session
  const { data: newSession, error: createError } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: userId,
      thread_id: thread.id,
      status: 'active'
    })
    .select('session_id')
    .single();

  if (createError) throw new Error(`Failed to create chat session: ${createError.message}`);

  // If we have a file ID, update the excel_file with the session_id
  if (fileId) {
    const { error: updateError } = await supabase
      .from('excel_files')
      .update({ session_id: newSession.session_id })
      .eq('id', fileId);

    if (updateError) throw new Error(`Failed to update excel file: ${updateError.message}`);
  }
  
  console.log('✅ Created new session:', newSession.session_id);
  return {
    sessionId: newSession.session_id,
    threadId: thread.id
  };
}

async function storeChatMessage(
  supabase: any, 
  userId: string, 
  fileId: string | null, 
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

async function updateSessionWithThread(supabase: any, sessionId: string, threadId: string) {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ thread_id: threadId })
    .eq('session_id', sessionId);

  if (error) throw new Error(`Failed to update session with thread: ${error.message}`);
  console.log(`✅ Updated session ${sessionId} with thread ${threadId}`);
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] New request received`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log(`📝 [${requestId}] Request body:`, body);

    // Validate required fields
    if (!body.userId || !body.sessionId) {
      throw new Error('Missing required fields: userId and sessionId are required');
    }

    if (!body.query) {
      throw new Error('Missing required field: query');
    }

    const { fileId, query, userId, sessionId, threadId: existingThreadId } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY')
    });

    // Get or create OpenAI thread
    const assistant = await getOrCreateAssistant(openai);
    const thread = existingThreadId 
      ? { id: existingThreadId }
      : await openai.beta.threads.create();

    // Update session with thread ID if it's new
    if (!existingThreadId) {
      await updateSessionWithThread(supabase, sessionId, thread.id);
    }
    
    const excelData = await getExcelFileContent(supabase, fileId);
    
    // Send message to OpenAI
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: excelData 
        ? `Analyze this Excel data:\n${JSON.stringify(excelData)}\n\n${query}`
        : query
    });

    // Start the analysis
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    });

    // Monitor the run status
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    let attempts = 0;
    const maxAttempts = 60;
    
    while (runStatus.status !== "completed" && attempts < maxAttempts) {
      if (runStatus.status === "failed" || runStatus.status === "cancelled") {
        throw new Error(`Run ${runStatus.status}: ${runStatus.last_error?.message || 'Unknown error'}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      attempts++;
      console.log(`⏳ Run status: ${runStatus.status} (attempt ${attempts}/${maxAttempts})`);
    }

    if (attempts >= maxAttempts) throw new Error('Analysis timed out');
    
    // Get the assistant's response
    const messages = await openai.beta.threads.messages.list(thread.id);
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
        threadId: thread.id,
        sessionId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`❌ [${requestId}] Error:`, error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        details: error instanceof Error ? error.stack : undefined,
        requestId
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
