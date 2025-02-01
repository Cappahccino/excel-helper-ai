import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import OpenAI from 'openai';
import { Database } from '../../../src/integrations/supabase/types';

// Define types for the request body
interface RequestBody {
  fileId: string;
  query: string;
}

// Define types for the Lambda event
interface LambdaEvent {
  body: string;
  headers: {
    [key: string]: string;
  };
}

// Define types for the Lambda response
interface LambdaResponse {
  statusCode: number;
  headers: {
    'Content-Type': string;
    'Access-Control-Allow-Origin': string;
  };
  body: string;
}

// Initialize Supabase client with types
const supabase = createClient<Database>(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
});

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  try {
    // Parse and type the request body
    const { fileId, query }: RequestBody = JSON.parse(event.body);

    // Get file metadata from Supabase with proper types
    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError) throw fileError;

    // Download file from Supabase Storage
    const { data: fileBuffer, error: downloadError } = await supabase
      .storage
      .from('excel_files')
      .download(fileData.file_path);

    if (downloadError) throw downloadError;

    // Process Excel file with proper typing
    const arrayBuffer = await fileBuffer.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer));
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // Get OpenAI analysis with proper types
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

    // Store analysis in Supabase with proper types
    const { error: chatError } = await supabase
      .from('chat_messages')
      .insert({
        excel_file_id: fileId,
        content: completion.choices[0].message.content,
        is_ai_response: true,
        user_id: fileData.user_id // Required by the schema
      });

    if (chatError) throw chatError;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        analysis: completion.choices[0].message.content
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
    };
  }
};