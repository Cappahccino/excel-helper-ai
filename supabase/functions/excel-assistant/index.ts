import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "npm:openai";

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
    // First, try to list existing assistants
    const assistants = await openai.beta.assistants.list({
      limit: 1,
      order: "desc"
    });
    console.log('📋 Found existing assistants:', assistants.data.length);

    // If we find an existing assistant, use it
    if (assistants.data.length > 0) {
      console.log('✅ Using existing assistant:', assistants.data[0].id);
      return assistants.data[0];
    }

    // If no assistant exists, create a new one
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
      model: "gpt-4o",
    });

    console.log('✅ Created new assistant:', assistant.id);
    return assistant;
  } catch (error) {
    console.error('❌ Error in getOrCreateAssistant:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
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
    const { fileId, query, userId, jsonData } = await req.json();
    console.log(`📝 [${requestId}] Processing request for:`, {
      fileId,
      userId,
      queryLength: query?.length,
      dataSize: JSON.stringify(jsonData).length
    });

    if (!fileId || !query || !userId || !jsonData) {
      console.error(`❌ [${requestId}] Missing required fields:`, {
        hasFileId: !!fileId,
        hasQuery: !!query,
        hasUserId: !!userId,
        hasJsonData: !!jsonData
      });
      throw new Error('Missing required fields');
    }

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
      content: `Analyze this Excel data: ${JSON.stringify(jsonData)}. Query: ${query}`
    });
    console.log(`✅ [${requestId}] Added user message to thread`);

    // Create a run
    console.log(`🏃 [${requestId}] Creating run...`);
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    });
    console.log(`✅ [${requestId}] Created run:`, run.id);

    // Wait for the run to complete
    console.log(`⏳ [${requestId}] Waiting for run to complete...`);
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    let attempts = 0;
    const maxAttempts = 60; // Maximum 60 seconds wait
    
    while (runStatus.status !== "completed" && attempts < maxAttempts) {
      console.log(`🔄 [${requestId}] Run status:`, runStatus.status);
      
      if (runStatus.status === "failed" || runStatus.status === "cancelled") {
        console.error(`❌ [${requestId}] Run failed:`, {
          status: runStatus.status,
          error: runStatus.last_error
        });
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

    console.log(`✅ [${requestId}] Run completed successfully`);

    // Get the assistant's response
    console.log(`📥 [${requestId}] Retrieving messages...`);
    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data[0];
    console.log(`✅ [${requestId}] Retrieved messages:`, {
      messageCount: messages.data.length,
      responseLength: lastMessage.content[0].text.value.length
    });

    // Format the response
    const response = {
      threadId: thread.id,
      message: lastMessage.content[0].text.value,
      model: assistant.model,
      usage: {
        prompt_tokens: 0, // The Assistants API doesn't provide token usage
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    console.log(`🏁 [${requestId}] Request completed successfully`);
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Error in excel-assistant function:`, error);
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