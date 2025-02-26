
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createAssistant, processFileWithAssistant } from "./assistant.ts";
import { ASSISTANT_INSTRUCTIONS } from "./config.ts";
import { processExcelFiles } from "./excel.ts";
import { supabaseAdmin } from "./database.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      fileIds,
      query,
      userId,
      sessionId,
      threadId,
      messageId
    } = await req.json();

    if (!fileIds?.length) {
      throw new Error('No file IDs provided');
    }

    console.log('Processing request:', {
      fileIds,
      query,
      userId,
      sessionId,
      threadId,
      messageId
    });

    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY')
    });

    // Process Excel files
    const fileContents = await processExcelFiles(fileIds);
    console.log('Files processed successfully');

    // Get or create assistant
    const assistant = await createAssistant(openai);
    console.log('Assistant ready:', assistant.id);

    // Update session with assistant ID if needed
    await supabaseAdmin
      .from('chat_sessions')
      .update({ 
        assistant_id: assistant.id,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId);

    // Process the request with the assistant
    const response = await processFileWithAssistant({
      openai,
      assistant,
      query,
      fileContents,
      threadId,
      messageId,
      sessionId
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in excel-assistant function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

