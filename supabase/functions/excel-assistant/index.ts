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

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
});

// Excel file handling
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

// OpenAI assistant management
async function getOrCreateAssistant() {
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
      - Format responses clearly`,
    model: "gpt-4o",
  });

  console.log('✅ Created new assistant:', assistant.id);
  return assistant;
}

// Thread management
async function handleThreadMessage(threadId: string, content: string, assistant: any) {
  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content
  });

  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistant.id,
  });

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
  }

  if (attempts >= maxAttempts) throw new Error('Analysis timed out');

  return openai.beta.threads.messages.list(threadId);
}

// Main request handler
serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] New request received`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, query, userId, threadId } = await req.json();
    console.log(`📝 [${requestId}] Processing:`, { fileId, userId, hasThread: !!threadId });

    if (!fileId || !query || !userId) {
      throw new Error('Missing required fields');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const assistant = await getOrCreateAssistant();
    const thread = threadId ? { id: threadId } : await openai.beta.threads.create();
    
    if (!threadId) {
      const excelData = await getExcelFileContent(supabase, fileId);
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: `Excel file context: ${JSON.stringify(excelData)}`
      });
    }

    const messages = await handleThreadMessage(thread.id, query, assistant);
    const lastMessage = messages.data[0];

    await supabase.from('chat_messages').insert([
      {
        user_id: userId,
        excel_file_id: fileId,
        content: query,
        thread_id: thread.id,
        is_ai_response: false
      },
      {
        user_id: userId,
        excel_file_id: fileId,
        content: lastMessage.content[0].text.value,
        thread_id: thread.id,
        is_ai_response: true,
        openai_model: assistant.model,
        raw_response: lastMessage
      }
    ]);

    console.log(`✅ [${requestId}] Analysis complete`);
    return new Response(
      JSON.stringify({ 
        message: lastMessage.content[0].text.value,
        threadId: thread.id
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