import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import OpenAI from 'openai';
import type { Database } from '../src/integrations/supabase/types';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface RequestBody {
  fileId: string;
  query: string;
  userId: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  try {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    const { fileId, query, userId } = JSON.parse(event.body || '{}') as RequestBody;

    if (!fileId || !query || !userId) {
      throw new Error('Missing required fields: fileId, query, and userId are required');
    }

    console.log('Processing request for:', { fileId, userId });

    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fileError) throw fileError;
    if (!fileData) throw new Error('File not found');

    console.log('File metadata retrieved:', fileData);

    const { error: userMessageError } = await supabase
      .from('chat_messages')
      .insert({
        content: query,
        excel_file_id: fileId,
        is_ai_response: false,
        user_id: userId
      });

    if (userMessageError) throw userMessageError;
    console.log('User message stored successfully');

    const { data: fileBuffer, error: downloadError } = await supabase
      .storage
      .from('excel_files')
      .download(fileData.file_path);

    if (downloadError) throw downloadError;
    if (!fileBuffer) throw new Error('File buffer is empty');

    console.log('File downloaded successfully');

    const arrayBuffer = await fileBuffer.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer));
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    console.log('Excel file processed, getting OpenAI analysis');

    // Get raw OpenAI response
    const rawResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are analyzing Excel data. Provide clear, concise insights."
        },
        {
          role: "user",
          content: `Analyze this Excel data: ${JSON.stringify(jsonData.slice(0, 100))}. Query: ${query}`
        }
      ]
    });

    console.log('OpenAI raw response received:', rawResponse);

    // Create structured response using the raw response
    const openAiResponse = {
      id: rawResponse.id, // This is the chat_id (e.g., "chatcmpl-xxx")
      model: rawResponse.model,
      responseContent: rawResponse.choices[0].message.content,
      usage: rawResponse.usage,
      created: rawResponse.created,
      choices: rawResponse.choices
    };

    // Store AI response in chat_messages
    const { error: aiMessageError } = await supabase
      .from('chat_messages')
      .insert({
        content: openAiResponse.responseContent,
        excel_file_id: fileId,
        is_ai_response: true,
        user_id: userId,
        chat_id: openAiResponse.id,
        openai_model: openAiResponse.model,
        openai_usage: openAiResponse.usage,
        raw_response: rawResponse
      });

    if (aiMessageError) {
      console.error('Error storing AI response:', aiMessageError);
      throw aiMessageError;
    }

    console.log('AI response stored successfully');

    // Return the structured response
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        fileName: fileData.filename,
        fileSize: fileData.file_size,
        message: openAiResponse.responseContent,
        openAiResponse,
        rawResponse,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      })
    };
  }
};