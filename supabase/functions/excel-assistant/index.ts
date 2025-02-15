
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

async function processExcelFile(supabase: any, fileId: string): Promise<ExcelData[] | null> {
  if (!fileId) return null;
  
  console.log(`📂 Processing file ID: ${fileId}`);
  
  // Get file metadata from database
  const { data: fileData, error: fileError } = await supabase
    .from('excel_files')
    .select('file_path')
    .eq('id', fileId)
    .single();

  if (fileError) throw new Error(`File metadata error: ${fileError.message}`);
  
  // Download file from storage
  const { data: fileBuffer, error: downloadError } = await supabase.storage
    .from('excel_files')
    .download(fileData.file_path);

  if (downloadError) throw new Error(`File download error: ${downloadError.message}`);

  // Process Excel file
  try {
    const arrayBuffer = await fileBuffer.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    
    const results: ExcelData[] = [];
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      // Limit data to first 1000 rows to avoid token limits
      const limitedData = jsonData.slice(0, 1000);
      
      results.push({
        sheetName,
        data: limitedData
      });
    }
    
    return results;
  } catch (error) {
    console.error('Excel processing error:', error);
    throw new Error(`Failed to process Excel file: ${error.message}`);
  }
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

    // Process Excel file if provided
    const excelData = await processExcelFile(supabase, fileId);
    
    // Prepare system message based on context
    const systemMessage = excelData 
      ? "You are an Excel data analyst assistant. Analyze the provided Excel data and answer questions about it. Focus on providing clear insights and explanations. If data seems incomplete or unclear, mention this in your response."
      : "You are a helpful Excel assistant. Answer questions about Excel and data analysis.";

    // Prepare user message with Excel data context if available
    const userMessage = excelData 
      ? `Analyzing Excel file with ${excelData.length} sheet(s):\n\n${JSON.stringify(excelData, null, 2)}\n\nUser Query: ${query}`
      : query;

    // Create completion with streaming
    const stream = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 2000, // Increased token limit for complex Excel analysis
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
