import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import OpenAI from "npm:openai";
import { read, utils } from 'npm:xlsx';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
});

async function getOrCreateAssistant() {
  console.log('🔍 Getting or creating assistant...');
  try {
    const assistants = await openai.beta.assistants.list({
      limit: 1,
      order: "desc"
    });

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
        Present analysis in structured sections with proper formatting.`,
      model: "gpt-4o",
    });

    console.log('✅ Created new assistant:', assistant.id);
    return assistant;
  } catch (error) {
    console.error('❌ Assistant error:', error);
    throw error;
  }
}

async function getExcelFileContent(supabase: any, fileId: string) {
  console.log(`📂 Fetching Excel file ID: ${fileId}`);
  
  const { data: fileData, error: fileError } = await supabase
    .from('excel_files')
    .select('file_path')
    .eq('id', fileId)
    .single();

  if (fileError) {
    console.error('❌ File metadata error:', fileError);
    throw new Error('Failed to fetch file metadata');
  }

  const { data: fileContent, error: downloadError } = await supabase
    .storage
    .from('excel_files')
    .download(fileData.file_path);

  if (downloadError) {
    console.error('❌ Download error:', downloadError);
    throw new Error('Failed to download file');
  }

  const arrayBuffer = await fileContent.arrayBuffer();
  const workbook = read(arrayBuffer);
  
  // Process each sheet
  const jsonData = workbook.SheetNames.map(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    return {
      sheetName,
      data: utils.sheet_to_json(sheet)
    };
  });

  console.log(`📊 Parsed ${jsonData.length} sheets`);
  return jsonData;
}

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

    // Get or create assistant
    const assistant = await getOrCreateAssistant();
    
    // Handle thread creation or reuse
    const thread = threadId 
      ? { id: threadId }
      : await openai.beta.threads.create();
    
    console.log(`🧵 [${requestId}] Using thread:`, thread.id);

    // For new threads, get Excel data and add context
    if (!threadId) {
      const excelData = await getExcelFileContent(supabase, fileId);
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: `Excel file context: ${JSON.stringify(excelData)}`
      });
    }

    // Add the user's query
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: query
    });

    // Run analysis
    console.log(`🏃 [${requestId}] Starting analysis...`);
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    });

    // Wait for completion
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
    }

    if (attempts >= maxAttempts) {
      throw new Error('Analysis timed out');
    }

    // Get response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data[0];

    // Store messages
    await supabase
      .from('chat_messages')
      .insert([
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