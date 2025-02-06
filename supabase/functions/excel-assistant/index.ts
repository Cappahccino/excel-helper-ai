
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

async function updateChatSession(supabase: any, sessionId: string, openaiModel: string, openaiUsage: any) {
  const { error } = await supabase
    .from('chat_sessions')
    .update({
      openai_model: openaiModel,
      openai_usage: openaiUsage
    })
    .eq('session_id', sessionId);

  if (error) {
    console.error('Error updating chat session:', error);
    throw new Error(`Failed to update chat session: ${error.message}`);
  }
}

async function storeChatMessage(supabase: any, userId: string, fileId: string | null, threadId: string, content: string, role: 'user' | 'assistant', isAiResponse = false) {
  const { error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: userId,
      excel_file_id: fileId,
      content,
      session_id: threadId,
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

    if (!query || !userId) {
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
    let excelData: ExcelData[] = [];
    
    if (fileId) {
      excelData = await getExcelFileContent(supabase, fileId);
    }

    // Create or use existing thread
    let thread;
    if (!threadId) {
      thread = await openai.beta.threads.create();
      threadId = thread.id;
    }

    // Send message to OpenAI
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: fileId ? `Analyze this Excel data:\n${JSON.stringify(excelData)}\n\n${query}` : query
    });

    // Start the analysis
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistant.id,
    });

    // Monitor the run status
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
    
    // Get the assistant's response
    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data[0];

    // Update chat session with OpenAI model and usage
    await updateChatSession(supabase, threadId, assistant.model, {
      run_id: run.id,
      // Add any other relevant usage data you want to track
    });

    // Store the AI response
    await storeChatMessage(
      supabase,
      userId,
      fileId,
      threadId,
      lastMessage.content[0].text.value,
      'assistant',
      true
    );

    console.log(`✅ [${requestId}] Analysis complete`);
    return new Response(
      JSON.stringify({ 
        message: lastMessage.content[0].text.value,
        threadId
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
