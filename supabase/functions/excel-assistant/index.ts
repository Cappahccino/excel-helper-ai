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

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] New request received`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log(`📝 [${requestId}] Request body:`, body);

    if (!body.userId || !body.sessionId) {
      throw new Error('Missing required fields: userId and sessionId are required');
    }

    if (!body.query) {
      throw new Error('Missing required field: query');
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

    // Get Excel data if needed
    const excelData = await getExcelFileContent(supabase, fileId);
    
    // Prepare the system message and user query
    const systemMessage = excelData 
      ? "You are a data analysis assistant. Analyze the provided Excel data and answer questions about it."
      : "You are a helpful Excel assistant. Answer questions about Excel and data analysis.";

    const userMessage = excelData 
      ? `Analyze this Excel data:\n${JSON.stringify(excelData)}\n\n${query}`
      : query;

    // Create completion with streaming
    const stream = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      stream: true,
    });

    console.log(`✨ [${requestId}] Starting stream processing`);

    // Process the stream
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        accumulatedContent += content;
        await updateStreamingMessage(supabase, message.id, accumulatedContent, false);
      }
    }

    // Mark message as complete
    await updateStreamingMessage(supabase, message.id, accumulatedContent, true);
    
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
