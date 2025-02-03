import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import OpenAI from 'openai';
import type { Database } from '../src/integrations/supabase/types';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Custom Error Class
class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

// Interfaces
interface RequestBody {
  fileId: string;
  query: string;
  userId: string;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIChoice {
  message: {
    content: string;
    role: string;
  };
  finish_reason: string;
  index: number;
}

interface RawResponse {
  id: string;
  model: string;
  created: number;
  usage: OpenAIUsage;
  choices: OpenAIChoice[];
  system_fingerprint: string;
}

interface ChatMessage {
  content: string;
  excel_file_id: string;
  is_ai_response: boolean;
  user_id: string;
  chat_id?: string;
  openai_model?: string;
  openai_usage?: OpenAIUsage;
  raw_response?: RawResponse;
}

interface AnalysisResponse {
  fileName: string;
  fileSize: number;
  message: string;
  openAiResponse: {
    model: string;
    usage: OpenAIUsage;
    responseContent: string;
    id: string;
  };
  timestamp: string;
}

// Initialize clients
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Constants
const SYSTEM_PROMPT = `
You are an Excel data analyst assistant. Your role is to:
- Provide clear, concise insights from Excel data
- Focus on relevant patterns and trends
- Use numerical evidence to support conclusions
- Highlight notable outliers or anomalies
- Format responses for readability
Please present your analysis in a structured way using clear sections and proper formatting.
`;

// Helper Functions
const validateRequest = (body: any): RequestBody => {
  const { fileId, query, userId } = body;
  
  if (!fileId || typeof fileId !== 'string') {
    throw new AnalysisError('Invalid fileId', 'INVALID_FILE_ID', 400);
  }
  
  if (!query || typeof query !== 'string') {
    throw new AnalysisError('Invalid query', 'INVALID_QUERY', 400);
  }
  
  if (!userId || typeof userId !== 'string') {
    throw new AnalysisError('Invalid userId', 'INVALID_USER_ID', 400);
  }
  
  return { fileId, query, userId };
};

const processExcelFile = async (fileBuffer: ArrayBuffer) => {
  try {
    const workbook = XLSX.read(new Uint8Array(fileBuffer));
    
    if (!workbook.SheetNames.length) {
      throw new AnalysisError('Excel file contains no sheets', 'EMPTY_WORKBOOK', 400);
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(worksheet);
  } catch (error) {
    if (error instanceof AnalysisError) throw error;
    throw new AnalysisError(
      'Failed to process Excel file',
      'EXCEL_PROCESSING_ERROR',
      500
    );
  }
};

const storeMessage = async (message: ChatMessage): Promise<void> => {
  const { error } = await supabase
    .from('chat_messages')
    .insert(message);

  if (error) {
    throw new AnalysisError(
      'Failed to store message',
      'DATABASE_ERROR',
      500
    );
  }
};

// Main Handler
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  try {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // Validate request
    const { fileId, query, userId } = validateRequest(JSON.parse(event.body || '{}'));

    console.log('Processing request for:', { fileId, userId });

    // Get file metadata
    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fileError) throw new AnalysisError('Database error', 'DATABASE_ERROR', 500);
    if (!fileData) throw new AnalysisError('File not found', 'FILE_NOT_FOUND', 404);

    console.log('File metadata retrieved:', fileData);

    // Store user message
    await storeMessage({
      content: query,
      excel_file_id: fileId,
      is_ai_response: false,
      user_id: userId
    });

    console.log('User message stored successfully');

    // Download and process file
    const { data: fileBuffer, error: downloadError } = await supabase
      .storage
      .from('excel_files')
      .download(fileData.file_path);

    if (downloadError) throw new AnalysisError('File download failed', 'DOWNLOAD_ERROR', 500);
    if (!fileBuffer) throw new AnalysisError('File buffer is empty', 'EMPTY_FILE', 400);

    console.log('File downloaded successfully');

    const jsonData = await processExcelFile(await fileBuffer.arrayBuffer());

    console.log('Excel file processed, getting OpenAI analysis');

    // Get OpenAI response
    const rawResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: `Analyze this Excel data: ${JSON.stringify(jsonData.slice(0, 100))}. Query: ${query}`
        }
      ]
    });

    console.log('OpenAI raw response received:', JSON.stringify(rawResponse, null, 2));

    // Clean response for storage
    const cleanResponse: RawResponse = {
      id: rawResponse.id,
      model: rawResponse.model,
      created: rawResponse.created,
      usage: rawResponse.usage,
      choices: rawResponse.choices,
      system_fingerprint: rawResponse.system_fingerprint
    };

    // Store AI response
    await storeMessage({
      content: rawResponse.choices[0].message.content,
      excel_file_id: fileId,
      is_ai_response: true,
      user_id: userId,
      chat_id: rawResponse.id,
      openai_model: rawResponse.model,
      openai_usage: rawResponse.usage,
      raw_response: cleanResponse
    });

    console.log('AI response stored successfully');

    // Prepare and return response
    const response: AnalysisResponse = {
      fileName: fileData.filename,
      fileSize: fileData.file_size,
      message: rawResponse.choices[0].message.content,
      openAiResponse: {
        model: rawResponse.model,
        usage: rawResponse.usage,
        responseContent: rawResponse.choices[0].message.content,
        id: rawResponse.id
      },
      timestamp: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Error:', error);
    
    const statusCode = error instanceof AnalysisError ? error.statusCode : 500;
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
    return {
      statusCode,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: errorMessage,
        code: error instanceof AnalysisError ? error.code : 'UNKNOWN_ERROR'
      })
    };
  }
};