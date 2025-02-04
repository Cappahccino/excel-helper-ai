import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
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

interface TokenDetails {
  cached_tokens: number;
  audio_tokens: number;
  reasoning_tokens?: number;
  accepted_prediction_tokens?: number;
  rejected_prediction_tokens?: number;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: TokenDetails;
  completion_tokens_details?: TokenDetails;
}

interface ChatMessage {
  content: string;
  excel_file_id: string;
  is_ai_response: boolean;
  user_id: string;
  chat_id?: string;
  openai_model?: string;
  openai_usage?: OpenAIUsage;
  raw_response?: any;
  created_at?: string;
  thread_id?: string | null;
}

// Initialize client
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // Limit the data to prevent token overflow
    const limitedData = jsonData.slice(0, 50); // Only analyze first 50 rows
    return limitedData;
  } catch (error) {
    if (error instanceof AnalysisError) throw error;
    throw new AnalysisError(
      'Failed to process Excel file',
      'EXCEL_PROCESSING_ERROR',
      500
    );
  }
};

const processChunkedFile = async (fileData: any): Promise<ArrayBuffer> => {
  const { data: chunks, error: chunksError } = await supabase.storage
    .from('excel_files')
    .list(fileData.file_path.split('/')[0]);

  if (chunksError) throw chunksError;

  // Sort chunks by index
  const sortedChunks = chunks
    .filter(chunk => chunk.name.includes('_chunk_'))
    .sort((a, b) => {
      const aIndex = parseInt(a.name.split('_chunk_')[1]);
      const bIndex = parseInt(b.name.split('_chunk_')[1]);
      return aIndex - bIndex;
    });

  // Combine chunks
  const buffers: ArrayBuffer[] = [];
  for (const chunk of sortedChunks) {
    const { data: chunkData, error: downloadError } = await supabase.storage
      .from('excel_files')
      .download(`${fileData.file_path}_chunk_${chunk.name.split('_chunk_')[1]}`);

    if (downloadError) throw downloadError;
    buffers.push(await chunkData.arrayBuffer());
  }

  // Concatenate buffers
  const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    combined.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return combined.buffer;
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  try {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    const { fileId, query, userId } = validateRequest(JSON.parse(event.body || '{}'));
    console.log('Processing request for:', { fileId, userId });

    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fileError) throw new AnalysisError('Database error', 'DATABASE_ERROR', 500);
    if (!fileData) throw new AnalysisError('File not found', 'FILE_NOT_FOUND', 404);

    console.log('File metadata retrieved:', fileData);

    // Process chunked file
    const fileBuffer = await processChunkedFile(fileData);
    console.log('Chunked file processed successfully');

    const jsonData = await processExcelFile(fileBuffer);
    console.log('Excel file processed, calling excel-assistant function');

    try {
      const { data: analysis, error } = await supabase.functions.invoke('excel-assistant', {
        body: { fileId, query, userId, jsonData }
      });

      if (error) throw error;

      // Store messages
      const { error: messagesError } = await supabase
        .from('chat_messages')
        .insert([
          {
            thread_id: analysis.threadId,
            content: query,
            is_ai_response: false,
            user_id: userId,
            excel_file_id: fileId,
          },
          {
            thread_id: analysis.threadId,
            content: analysis.message,
            is_ai_response: true,
            user_id: userId,
            excel_file_id: fileId,
            openai_model: analysis.model,
            openai_usage: analysis.usage,
          }
        ]);

      if (messagesError) {
        throw new AnalysisError(
          `Failed to store messages: ${messagesError.message}`,
          'MESSAGE_STORAGE_ERROR',
          500
        );
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          fileName: fileData.filename,
          fileSize: fileData.file_size,
          message: analysis.message,
          openAiResponse: {
            model: analysis.model,
            usage: analysis.usage,
            responseContent: analysis.message,
            id: analysis.threadId,
          },
          timestamp: new Date().toISOString()
        })
      };

    } catch (error: any) {
      if (error?.response?.status === 429 || error?.message?.includes('too large')) {
        throw new AnalysisError(
          'The Excel file is too large to analyze. Please try with a smaller dataset or a more specific query.',
          'TOKEN_LIMIT_EXCEEDED',
          400
        );
      }
      throw error;
    }

  } catch (error) {
    console.error('Error in handler:', error);
    
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