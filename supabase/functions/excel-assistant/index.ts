
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

async function generateChatName(openai: OpenAI, query: string, excelData: ExcelData[] | null): Promise<string> {
  try {
    const fileContext = excelData 
      ? `The conversation is about an Excel file containing ${excelData.length} sheet(s). First sheet: "${excelData[0]?.sheetName}".`
      : 'This is a general Excel-related conversation.';

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: "Generate a short, descriptive title (2-4 words) for this chat conversation. Return ONLY the title, no explanations or punctuation."
        },
        {
          role: "user",
          content: `Create a concise title based on this context:\n${fileContext}\nFirst message: "${query}"`
        }
      ],
      temperature: 0.3,
      max_tokens: 20,
    });

    return response.choices[0]?.message?.content?.trim() || 'Excel Analysis Chat';
  } catch (error) {
    console.error('Error generating chat name:', error);
    return 'Excel Analysis Chat';
  }
}

async function processExcelFile(supabase: any, fileId: string): Promise<ExcelData[] | null> {
  if (!fileId) return null;
  
  console.log(`📂 Processing file ID: ${fileId}`);
  
  const { data: fileData, error: fileError } = await supabase
    .from('excel_files')
    .select('file_path')
    .eq('id', fileId)
    .single();

  if (fileError) throw new Error(`File metadata error: ${fileError.message}`);
  
  const { data: fileBuffer, error: downloadError } = await supabase.storage
    .from('excel_files')
    .download(fileData.file_path);

  if (downloadError) throw new Error(`File download error: ${downloadError.message}`);

  try {
    const arrayBuffer = await fileBuffer.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    
    const results: ExcelData[] = [];
    
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
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

async function getSessionContext(supabase: any, sessionId: string) {
  const { data: session, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error) throw new Error(`Failed to get session context: ${error.message}`);
  return session;
}

async function getMessageHistory(supabase: any, sessionId: string) {
  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to get message history: ${error.message}`);
  return messages;
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

    // Get session context and active file
    const session = await getSessionContext(supabase, sessionId);
    const activeFileId = fileId || session?.excel_file_id;
    
    // Get message history
    const messageHistory = await getMessageHistory(supabase, sessionId);
    
    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY')
    });

    // Create initial empty message
    const message = await createInitialMessage(supabase, userId, sessionId, activeFileId);
    let accumulatedContent = '';

    // Process Excel file if available
    const excelData = await processExcelFile(supabase, activeFileId);
    
    // Prepare system message
    const systemMessage = excelData 
      ? "You are an Excel data analyst assistant. Analyze the provided Excel data and answer questions about it. Focus on providing clear insights and explanations. If data seems incomplete or unclear, mention this in your response. Maintain context from the conversation history."
      : "You are a helpful Excel assistant. Answer questions about Excel and data analysis. Maintain context from the conversation history.";

    // Prepare conversation history for OpenAI
    const conversationHistory = messageHistory.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    // Prepare user message with Excel data context if available
    const userMessage = excelData 
      ? `Excel file context with ${excelData.length} sheet(s):\n\n${JSON.stringify(excelData, null, 2)}\n\nUser Query: ${query}`
      : query;

    // Create completion with streaming
    const stream = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: systemMessage },
        ...conversationHistory,
        { role: "user", content: userMessage }
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    }, { signal });

    console.log(`✨ [${requestId}] Starting stream processing`);

    try {
      let updateBuffer = '';
      const updateInterval = 25;
      let lastUpdate = Date.now();

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          updateBuffer += content;
          accumulatedContent += content;

          const now = Date.now();
          if (now - lastUpdate >= updateInterval || content.includes('\n')) {
            await updateStreamingMessage(supabase, message.id, accumulatedContent, false);
            updateBuffer = '';
            lastUpdate = now;
          }
        }
      }

      if (updateBuffer) {
        await updateStreamingMessage(supabase, message.id, accumulatedContent, true);
      }

      // Generate and update chat name if this is a new session or has default name
      if (messageHistory.length === 0 || session.chat_name === 'Untitled Chat') {
        const chatName = await generateChatName(openai, query, excelData);
        await supabase
          .from('chat_sessions')
          .update({ 
            chat_name: chatName,
            excel_file_id: activeFileId 
          })
          .eq('session_id', sessionId);
      } else {
        // Update session with latest file_id if needed
        if (activeFileId && !session.excel_file_id) {
          await supabase
            .from('chat_sessions')
            .update({ excel_file_id: activeFileId })
            .eq('session_id', sessionId);
        }
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
