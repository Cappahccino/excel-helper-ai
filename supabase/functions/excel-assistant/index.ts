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

// Create or get the assistant
async function getOrCreateAssistant() {
  console.log('🔍 Attempting to get or create assistant...');
  try {
    const assistants = await openai.beta.assistants.list({
      limit: 1,
      order: "desc"
    });
    console.log('📋 Found existing assistants:', assistants.data.length);

    if (assistants.data.length > 0) {
      console.log('✅ Using existing assistant:', assistants.data[0].id);
      return assistants.data[0];
    }

    console.log('🆕 No existing assistant found, creating new one...');
    const assistant = await openai.beta.assistants.create({
      name: "Excel Analyst",
      instructions: `You are an Excel data analyst assistant. Your role is to:
        - Provide clear, concise insights from Excel data
        - Focus on relevant patterns and trends
        - Use numerical evidence to support conclusions
        - Highlight notable outliers or anomalies
        - Format responses for readability
        Please present your analysis in a structured way using clear sections and proper formatting.`,
      model: "gpt-4",
    });

    console.log('✅ Created new assistant:', assistant.id);
    return assistant;
  } catch (error) {
    console.error('❌ Error in getOrCreateAssistant:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

async function getExcelFileContent(supabase: any, fileId: string) {
  console.log(`📂 Fetching Excel file with ID: ${fileId}`);
  
  // First, get the file metadata from the database
  const { data: fileData, error: fileError } = await supabase
    .from('excel_files')
    .select('file_path')
    .eq('id', fileId)
    .single();

  if (fileError) {
    console.error('❌ Error fetching file metadata:', fileError);
    throw new Error('Failed to fetch file metadata');
  }

  // Download the file from storage
  const { data: fileContent, error: downloadError } = await supabase
    .storage
    .from('excel_files')
    .download(fileData.file_path);

  if (downloadError) {
    console.error('❌ Error downloading file:', downloadError);
    throw new Error('Failed to download file from storage');
  }

  // Convert the file to ArrayBuffer
  const arrayBuffer = await fileContent.arrayBuffer();
  
  // Parse Excel file
  const workbook = read(arrayBuffer);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = utils.sheet_to_json(firstSheet);

  console.log(`📊 Successfully parsed Excel data with ${jsonData.length} rows`);
  return jsonData;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] New request received`);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log(`✨ [${requestId}] Handling CORS preflight request`);
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, query, userId } = await req.json();
    console.log(`📝 [${requestId}] Processing request for:`, { fileId, userId, queryLength: query?.length });

    if (!fileId || !query || !userId) {
      console.error(`❌ [${requestId}] Missing required fields`);
      throw new Error('Missing required fields');
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get Excel file content
    console.log(`📥 [${requestId}] Fetching Excel content`);
    const excelData = await getExcelFileContent(supabase, fileId);

    // Get or create the assistant
    console.log(`🤖 [${requestId}] Getting assistant...`);
    const assistant = await getOrCreateAssistant();
    console.log(`✅ [${requestId}] Using assistant:`, assistant.id);

    // Create a new thread
    console.log(`🧵 [${requestId}] Creating new thread...`);
    const thread = await openai.beta.threads.create();
    console.log(`✅ [${requestId}] Created thread:`, thread.id);

    // Add the user's message to the thread
    console.log(`💬 [${requestId}] Adding user message to thread...`);
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: `Analyze this Excel data: ${JSON.stringify(excelData)}. Query: ${query}`
    });

    // Create a run
    console.log(`🏃 [${requestId}] Creating run...`);
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    });

    // Wait for the run to complete
    console.log(`⏳ [${requestId}] Waiting for run to complete...`);
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    let attempts = 0;
    const maxAttempts = 60; // Maximum 60 seconds wait
    
    while (runStatus.status !== "completed" && attempts < maxAttempts) {
      console.log(`🔄 [${requestId}] Run status:`, runStatus.status);
      
      if (runStatus.status === "failed" || runStatus.status === "cancelled") {
        console.error(`❌ [${requestId}] Run failed:`, runStatus);
        throw new Error(`Run ${runStatus.status}: ${runStatus.last_error?.message || 'Unknown error'}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.error(`⚠️ [${requestId}] Run timed out after ${maxAttempts} seconds`);
      throw new Error('Run timed out');
    }

    // Get the assistant's response
    console.log(`📥 [${requestId}] Retrieving messages...`);
    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data[0];

    // Store the message in the database
    const { error: dbError } = await supabase
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

    if (dbError) {
      console.error(`❌ [${requestId}] Database error:`, dbError);
      throw dbError;
    }

    console.log(`✅ [${requestId}] Request completed successfully`);
    return new Response(
      JSON.stringify({ 
        message: lastMessage.content[0].text.value,
        threadId: thread.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`❌ [${requestId}] Error:`, error);
    console.error(`📚 [${requestId}] Stack trace:`, error.stack);
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