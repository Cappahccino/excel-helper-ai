import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import OpenAI from 'openai';
import type { Database } from '../src/integrations/supabase/types';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Initialize Supabase client with proper typing
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
  userId: string; // Added to match the required user_id field
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  try {
    // Get file details from event with proper typing
    const { fileId, query, userId } = JSON.parse(event.body || '{}') as RequestBody;

    if (!fileId || !query || !userId) {
      throw new Error('Missing required fields: fileId, query, and userId are required');
    }

    // Get file metadata from Supabase
    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fileError) throw fileError;
    if (!fileData) throw new Error('File not found');

    // Download file from Supabase Storage
    const { data: fileBuffer, error: downloadError } = await supabase
      .storage
      .from('excel_files')
      .download(fileData.file_path);

    if (downloadError) throw downloadError;
    if (!fileBuffer) throw new Error('File buffer is empty');

    // Process Excel file
    const arrayBuffer = await fileBuffer.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer));
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // Get OpenAI analysis
    const completion = await openai.chat.completions.create({
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

    // Store analysis in Supabase with required user_id
    const { error: chatError } = await supabase
      .from('chat_messages')
      .insert({
        excel_file_id: fileId,
        content: completion.choices[0].message.content,
        is_ai_response: true,
        user_id: userId // Added required field
      });

    if (chatError) throw chatError;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: completion.choices[0].message.content
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