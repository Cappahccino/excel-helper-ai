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
  created_at?: string;
  thread_id?: string | null;
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
    raw_response?: RawResponse;
  };
  timestamp: string;
}

interface ExtractedOpenAIResponse {
  chatId: string;
  model: string;
  usage: OpenAIUsage;
  messageContent: string;
  rawResponse: RawResponse;
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

const sanitizeOpenAIResponse = (rawResponse: any): RawResponse => {
  const sanitizedUsage: OpenAIUsage = {
    prompt_tokens: rawResponse.usage.prompt_tokens,
    completion_tokens: rawResponse.usage.completion_tokens,
    total_tokens: rawResponse.usage.total_tokens,
    prompt_tokens_details: rawResponse.usage.prompt_tokens_details,
    completion_tokens_details: rawResponse.usage.completion_tokens_details
  };

  return {
    id: rawResponse.id,
    model: rawResponse.model,
    created: rawResponse.created,
    usage: sanitizedUsage,
    choices: rawResponse.choices.map((choice: any) => ({
      message: {
        content: choice.message.content,
        role: choice.message.role
      },
      finish_reason: choice.finish_reason,
      index: choice.index
    })),
    system_fingerprint: rawResponse.system_fingerprint
  };
};

const extractOpenAIResponseData = (rawResponse: any): ExtractedOpenAIResponse => {
  console.log('Raw OpenAI response:', JSON.stringify(rawResponse, null, 2));
  
  if (!rawResponse?.choices || !Array.isArray(rawResponse.choices) || rawResponse.choices.length === 0) {
    throw new AnalysisError('Invalid OpenAI response: missing choices', 'OPENAI_RESPONSE_ERROR', 500);
  }

  const messageContent = rawResponse.choices?.[0]?.message?.content;
  if (!messageContent) {
    throw new AnalysisError('Invalid OpenAI response: missing message content', 'OPENAI_RESPONSE_ERROR', 500);
  }

  const cleanResponse = sanitizeOpenAIResponse(rawResponse);

  return {
    chatId: rawResponse.id,
    model: rawResponse.model,
    usage: cleanResponse.usage,
    messageContent,
    rawResponse: cleanResponse
  };
};

const storeMessage = async (message: ChatMessage): Promise<void> => {
  console.log('Storing message with data:', JSON.stringify(message, null, 2));
  
  try {
    if (!message.content || !message.user_id) {
      throw new Error('Missing required fields in message');
    }

    const messageToStore = {
      ...message,
      created_at: message.created_at || new Date().toISOString(),
      raw_response: message.raw_response ? sanitizeOpenAIResponse(message.raw_response) : undefined,
      openai_usage: message.openai_usage ? {
        prompt_tokens: message.openai_usage.prompt_tokens,
        completion_tokens: message.openai_usage.completion_tokens,
        total_tokens: message.openai_usage.total_tokens
      } : undefined
    };

    const { error } = await supabase
      .from('chat_messages')
      .insert(messageToStore);

    if (error) {
      console.error('Database error when storing message:', error);
      throw new AnalysisError(
        `Failed to store message: ${error.message}`,
        'DATABASE_ERROR',
        500
      );
    }
    
    console.log('Message stored successfully');
  } catch (error) {
    console.error('Error in storeMessage:', error);
    throw new AnalysisError(
      'Failed to store message',
      'DATABASE_ERROR',
      500
    );
  }
};

// New function to create a thread for the conversation
const createThread = async (userId: string, fileId: string, query: string): Promise<string> => {
  try {
    const { data: thread, error } = await supabase
      .from('chat_threads')
      .insert({
        title: query.substring(0, 50) + '...',
        user_id: userId,
        excel_file_id: fileId
      })
      .select()
      .single();

    if (error) throw error;
    return thread.id;
  } catch (error) {
    console.error('Error creating thread:', error);
    throw new AnalysisError(
      'Failed to create chat thread',
      'THREAD_CREATION_ERROR',
      500
    );
  }
};

// New function to store messages in the thread
const storeMessages = async (
  threadId: string,
  userId: string,
  fileId: string,
  query: string,
  aiResponse: any
): Promise<void> => {
  const {
    id: chatId,
    model,
    usage,
    choices
  } = aiResponse;

  const messageContent = choices[0]?.message?.content;
  if (!messageContent) {
    throw new AnalysisError(
      'Invalid AI response: missing message content',
      'INVALID_RESPONSE',
      500
    );
  }

  const { error: messagesError } = await supabase
    .from('chat_messages')
    .insert([
      {
        thread_id: threadId,
        content: query,
        is_ai_response: false,
        user_id: userId,
        excel_file_id: fileId,
        chat_id: chatId
      },
      {
        thread_id: threadId,
        content: messageContent,
        is_ai_response: true,
        user_id: userId,
        excel_file_id: fileId,
        chat_id: chatId,
        openai_model: model,
        openai_usage: usage,
        raw_response: sanitizeOpenAIResponse(aiResponse)
      }
    ]);

  if (messagesError) {
    console.error('Error storing messages:', messagesError);
    throw new AnalysisError(
      'Failed to store messages',
      'MESSAGE_STORAGE_ERROR',
      500
    );
  }
};

// New function to process chunked files
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

// Update the handler to use the new processChunkedFile function
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

    const threadId = await createThread(userId, fileId, query);
    console.log('Created new thread:', threadId);

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
    console.log('Excel file processed, getting OpenAI analysis');

    try {
      const openAiResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { 
            role: "user", 
            content: `Analyze this Excel data (showing first 50 rows): ${JSON.stringify(jsonData)}. Query: ${query}` 
          }
        ],
        max_tokens: 1000
      });

      console.log('OpenAI response received:', JSON.stringify(openAiResponse, null, 2));

      // Store both messages with the thread ID
      await storeMessages(threadId, userId, fileId, query, openAiResponse);
      console.log('Messages stored successfully');

      const response: AnalysisResponse = {
        fileName: fileData.filename,
        fileSize: fileData.file_size,
        message: openAiResponse.choices[0].message.content,
        openAiResponse: {
          model: openAiResponse.model,
          usage: openAiResponse.usage,
          responseContent: openAiResponse.choices[0].message.content,
          id: openAiResponse.id,
          raw_response: sanitizeOpenAIResponse(openAiResponse)
        },
        timestamp: new Date().toISOString()
      };

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(response)
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
