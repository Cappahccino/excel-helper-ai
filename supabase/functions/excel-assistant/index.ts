
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import OpenAI from 'npm:openai';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExcelData {
  sheetName: string;
  data: Record<string, any>[];
}

async function updateStreamingMessage(supabase: any, messageId: string, content: string, isComplete: boolean) {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      content,
      is_streaming: !isComplete
    })
    .eq('id', messageId);

  if (error) console.error('Error updating message:', error);
}

async function createInitialMessage(supabase: any, userId: string, sessionId: string, fileId: string | null) {
  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: userId,
      session_id: sessionId,
      excel_file_id: fileId,
      content: '',
      role: 'assistant',
      is_ai_response: true,
      is_streaming: true
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create initial message: ${error.message}`);
  return message;
}

async function getFileContent(supabase: any, fileId: string): Promise<string | null> {
  if (!fileId) return null;
  
  console.log(`📂 Fetching file ID: ${fileId}`);
  
  const { data: fileData, error: fileError } = await supabase
    .from('excel_files')
    .select('content_preview')
    .eq('id', fileId)
    .single();

  if (fileError) throw new Error(`File metadata error: ${fileError.message}`);
  return fileData?.content_preview || null;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] New request received`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();
  const signal = controller.signal;

  try {
    const body = await req.json();
    console.log(`📝 [${requestId}] Request body:`, body);

    if (!body.userId || !body.sessionId || !body.query) {
      throw new Error('Missing required fields');
    }

    const { fileId, query, userId, sessionId } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY')
    });

    // Create initial empty message
    const message = await createInitialMessage(supabase, userId, sessionId, fileId);
    let accumulatedContent = '';

    // Get file content if needed (using optimized preview)
    const fileContent = await getFileContent(supabase, fileId);
    
    // Prepare the system message and user query
    const systemMessage = fileContent 
      ? "You are a data analysis assistant. Analyze the provided data and answer questions about it."
      : "You are a helpful Excel assistant. Answer questions about Excel and data analysis.";

    const userMessage = fileContent 
      ? `Analyze this data:\n${fileContent}\n\n${query}`
      : query;

    // Create completion with streaming
    const stream = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      stream: true,
      max_tokens: 1000, // Limit response length
    }, { signal });

    console.log(`✨ [${requestId}] Starting stream processing`);

    try {
      // Process the stream with chunking
      let updateBuffer = '';
      const updateInterval = 100; // ms
      let lastUpdate = Date.now();

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          updateBuffer += content;
          accumulatedContent += content;

          // Update database less frequently to reduce load
          const now = Date.now();
          if (now - lastUpdate >= updateInterval) {
            await updateStreamingMessage(supabase, message.id, accumulatedContent, false);
            updateBuffer = '';
            lastUpdate = now;
          }
        }
      }

      // Final update
      if (updateBuffer) {
        await updateStreamingMessage(supabase, message.id, accumulatedContent, true);
      }
    } catch (streamError) {
      console.error(`Stream error:`, streamError);
      controller.abort();
      throw streamError;
    }
    
    console.log(`✅ [${requestId}] Stream processing complete`);
    return new Response(
      JSON.stringify({ 
        message: accumulatedContent,
        messageId: message.id,
        sessionId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`❌ [${requestId}] Error:`, error);
    controller.abort();
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        requestId
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
