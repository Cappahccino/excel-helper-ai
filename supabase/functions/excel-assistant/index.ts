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
  try {
    // First, try to list existing assistants
    const assistants = await openai.beta.assistants.list({
      limit: 1,
      order: "desc"
    });

    // If we find an existing assistant, use it
    if (assistants.data.length > 0) {
      return assistants.data[0];
    }

    // If no assistant exists, create a new one
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

    console.log("Created new assistant:", assistant.id);
    return assistant;
  } catch (error) {
    console.error("Error getting/creating assistant:", error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, query, userId, jsonData } = await req.json();
    console.log('Processing request for:', { fileId, userId });

    if (!fileId || !query || !userId || !jsonData) {
      throw new Error('Missing required fields');
    }

    // Get or create the assistant
    const assistant = await getOrCreateAssistant();
    console.log("Using assistant:", assistant.id);

    // Create a new thread
    const thread = await openai.beta.threads.create();
    console.log("Created thread:", thread.id);

    // Add the user's message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: `Analyze this Excel data: ${JSON.stringify(jsonData)}. Query: ${query}`
    });

    // Create a run
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    });

    // Wait for the run to complete
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status !== "completed") {
      if (runStatus.status === "failed" || runStatus.status === "cancelled") {
        throw new Error(`Run ${runStatus.status}: ${runStatus.last_error?.message || 'Unknown error'}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }

    // Get the assistant's response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data[0];

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

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in excel-assistant function:', error);
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