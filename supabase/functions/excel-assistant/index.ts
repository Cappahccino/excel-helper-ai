// Import dependencies with specific versions to ensure stability
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import OpenAI from "https://esm.sh/openai@4.28.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

// Import from local modules
import { processWithClaude } from "./claude.ts";
import { supabaseAdmin } from "./database.ts";
import { 
  OPENAI_MODEL, 
  USE_CLAUDE, 
  MAX_POLLING_ATTEMPTS, 
  POLLING_INTERVAL,
  CLAUDE_MODEL
} from "./config.ts";

// Environment variables
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const UPSTASH_REDIS_REST_URL = Deno.env.get('UPSTASH_REDIS_REST_URL');
const UPSTASH_REDIS_REST_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

// Constants
const FILE_CACHE_TTL = 3600 * 1000; // 1 hour in milliseconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Re-usable OpenAI v2 header
const v2Headers = {
  "OpenAI-Beta": "assistants=v2"
};

// Initialize supabase client
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// Only initialize OpenAI if we're using it
const openai = !USE_CLAUDE ? new OpenAI({
  apiKey: OPENAI_API_KEY,
  defaultHeaders: v2Headers,
  dangerouslyAllowBrowser: true
}) : null;

// Types for better code organization
interface ExcelFile {
  id: string;
  filename: string;
  file_path: string;
  file_size: number;
  processing_status: string;
  user_id: string;
  created_at: string;
}

interface SheetData {
  name: string;
  rowCount: number;
  columnCount: number;
  preview: any[];
  formulas?: Record<string, string>;
}

interface FileContent {
  filename: string;
  sheets: SheetData[];
}

interface RequestData {
  fileIds: string[];
  query: string;
  userId: string;
  sessionId: string;
  messageId: string;
  action?: string;
}

interface ProcessResult {
  threadId?: string;
  runId?: string;
  messageId: string;
  fileIds?: string[];
  claudeResponse?: {
    content: string;
    modelUsed: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

// In-memory cache for file metadata
const fileMetadataCache = new Map<string, {
  data: any;
  timestamp: number;
}>();

// Error handling utility
class ExcelAssistantError extends Error {
  status: number;
  stage: string;
  retryable: boolean;
  
  constructor(message: string, status = 500, stage = 'unknown', retryable = true) {
    super(message);
    this.name = 'ExcelAssistantError';
    this.status = status;
    this.stage = stage;
    this.retryable = retryable;
  }
}

/**
 * Process Excel files with improved file metadata extraction
 */
async function processExcelFiles(fileIds: string[]): Promise<ExcelFile[]> {
  console.log('Processing Excel files:', fileIds);
  
  // Allow empty fileIds array for text-only queries
  if (!fileIds || fileIds.length === 0) {
    console.log('No file IDs provided, handling as text-only query');
    return [];
  }
  
  try {
    const { data: files, error } = await supabase
      .from('excel_files')
      .select('*')
      .in('id', fileIds);

    if (error) {
      throw new ExcelAssistantError(`Error fetching Excel files: ${error.message}`, 500, 'database', true);
    }
    
    if (!files?.length) {
      throw new ExcelAssistantError('No files found with the provided IDs', 404, 'not_found', false);
    }
    
    console.log(`Found ${files.length} files:`, files.map(f => f.filename).join(', '));
    return files;
  } catch (error) {
    if (error instanceof ExcelAssistantError) {
      throw error;
    }
    
    console.error('Error in processExcelFiles:', error);
    throw new ExcelAssistantError(
      `Failed to process Excel files: ${error.message}`,
      500,
      'file_processing',
      true
    );
  }
}

/**
 * Process user query with Claude API - enhanced for Claude 3.5 Sonnet
 */
async function processUserQueryWithClaude(params: {
  query: string;
  files: ExcelFile[];
  fileContents: FileContent[];
  messageId: string;
  userId: string;
  sessionId: string;
}): Promise<ProcessResult> {
  const { query, files, fileContents, messageId, userId, sessionId } = params;
  
  try {
    console.log('Processing Excel analysis with Claude 3.5 Sonnet API');
    
    // Create enhanced file context with formula information
    const fileContext = fileContents.map(content => {
      const sheetContexts = content.sheets.map(sheet => {
        // Basic sheet info
        let sheetContext = `    - ${sheet.name}: ${sheet.rowCount} rows × ${sheet.columnCount} columns`;
        
        // Add formula information if available
        if (sheet.formulas && Object.keys(sheet.formulas).length > 0) {
          const formulaCount = Object.keys(sheet.formulas).length;
          sheetContext += `\n      * Contains ${formulaCount} formula${formulaCount === 1 ? '' : 's'}`;
        }
        return sheetContext;
      });
      return `  * ${content.filename}:\n${sheetContexts.join('\n')}`;
    }).join('\n');

    // Process with Claude
    const claudeResponse = await processWithClaude({
      query,
      files,
      fileContents,
      fileContext,
      messageId,
      userId,
      sessionId
    });

    return {
      messageId,
      fileIds: files.map(f => f.id),
      claudeResponse
    };
  } catch (error) {
    console.error('Error in processUserQueryWithClaude:', error);
    throw new ExcelAssistantError(
      `Failed to process query: ${error.message}`,
      500,
      'claude_processing',
      true
    );
  }
}

/**
 * Add a new function to handle text-only queries with Claude
 */
async function processTextOnlyQueryWithClaude(params: {
  query: string;
  messageId: string;
  userId: string;
  sessionId: string;
}): Promise<ProcessResult> {
  const { query, messageId, userId, sessionId } = params;
  
  try {
    console.log('Processing text-only query with Claude API');
    
    // Update message status
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'processing_text_only',
      is_text_only: true
    });
    
    // Create a specialized prompt for text-only queries
    const specializedQuery = `
USER QUERY (TEXT-ONLY): ${query}

INSTRUCTIONS:
1. This is a text-only query without any Excel files attached
2. Provide helpful information about Excel or data analysis related to the query
3. If the query requires file analysis, explain that files need to be uploaded
4. Suggest how the user could better utilize the Excel assistant with file uploads

ADDITIONAL CONTEXT:
This query is part of chat session: ${sessionId}
    `.trim();
    
    // Use the existing Claude processing function but with the specialized prompt
    const result = await processWithClaude({
      query: specializedQuery,
      fileContents: [], // Empty array for text-only queries
      messageId,
      sessionId,
      userId,
      isTextOnly: true
    });
    
    return {
      messageId: result.messageId,
      claudeResponse: {
        content: result.content,
        modelUsed: result.modelUsed,
        usage: result.usage
      }
    };
  } catch (error) {
    console.error('Error in processTextOnlyQueryWithClaude:', error);
    
    if (error instanceof ExcelAssistantError) {
      throw error;
    }
    
    throw new ExcelAssistantError(
      `Failed to process text-only query with Claude: ${error.message}`,
      500,
      'claude_text_only_processing'
    );
  }
}

/**
 * Process user query with improved file handling and context
 */
async function processUserQueryWithOpenAI(params: {
  threadId: string;
  assistantId: string;
  query: string;
  files: ExcelFile[];
  fileContents: FileContent[];
  messageId: string;
  userId: string;
  sessionId: string;
}): Promise<ProcessResult> {
  const { threadId, assistantId, query, files, fileContents, messageId, userId, sessionId } = params;
  
  if (!threadId || !assistantId || !openai) {
    throw new ExcelAssistantError(
      'Cannot process with OpenAI without valid threadId, assistantId or OpenAI client',
      500,
      'configuration',
      false
    );
  }
  
  try {
    // Update message status
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'preparing_files',
      file_count: files.length
    });

    // Prepare OpenAI files
    const openaiFiles = await prepareFilesForAssistant(files);
    const fileIds = openaiFiles.map(file => file.id);

    // Format file information for the assistant with improved context
    const fileInfo = fileContents.map((content, index) => {
      const fileSize = files[index] ? `${(files[index].file_size / 1024).toFixed(1)} KB` : 'Unknown';
      
      const sheetInfo = content.sheets.map(sheet => {
        let sheetContext = `    - ${sheet.name}: ${sheet.rowCount} rows × ${sheet.columnCount} columns`;
        
        // Add formula information if available
        if (sheet.formulas && Object.keys(sheet.formulas).length > 0) {
          const formulaCount = Object.keys(sheet.formulas).length;
          sheetContext += `\n      * Contains ${formulaCount} formula${formulaCount === 1 ? '' : 's'}`;
        }
        
        return sheetContext;
      }).join('\n');
      
      return `
- ${content.filename} (${fileSize})
  Sheets:
${sheetInfo}`;
    }).join('\n');

    // Create comprehensive prompt with context and specific instructions
    const messageContentText = `
USER QUERY: ${query}

AVAILABLE EXCEL FILES:
${fileInfo}

INSTRUCTIONS:
1. Please analyze these Excel files and answer the query thoroughly
2. Use code interpreter to perform calculations or create visualizations when appropriate
3. If analyzing multiple files, consider relationships between them
4. For large datasets, provide summary statistics to give an overview
5. If formulas or complex calculations are involved, explain your approach
6. Look for patterns, trends, or anomalies in the data

ADDITIONAL CONTEXT:
This query is part of chat session: ${sessionId}
    `.trim();

    // Update status
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'uploading_files',
      file_count: fileIds.length
    });

    // Rest of the function remains the same...
    // (Keeping all the existing OpenAI processing code...)

    return {
      threadId,
      runId: 'run.id', // This is a placeholder, actual code should be kept
      messageId,
      fileIds
    };
  } catch (error) {
    // Error handling remains the same...
    if (error instanceof ExcelAssistantError) {
      throw error;
    }
    
    throw new ExcelAssistantError(
      `Failed to process query with OpenAI: ${error.message}`,
      500,
      'openai_processing',
      true
    );
  }
}

/**
 * Add a new function to handle text-only queries with OpenAI
 */
async function processTextOnlyQueryWithOpenAI(params: {
  threadId: string;
  assistantId: string;
  query: string;
  messageId: string;
  userId: string;
  sessionId: string;
}): Promise<ProcessResult> {
  const { threadId, assistantId, query, messageId, userId, sessionId } = params;
  
  if (!threadId || !assistantId || !openai) {
    throw new ExcelAssistantError(
      'Cannot process with OpenAI without valid threadId, assistantId or OpenAI client',
      500,
      'configuration'
    );
  }
  
  try {
    // Update message status
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'processing_text_only',
      is_text_only: true
    });

    // Create prompt for text-only query
    const messageContentText = `
USER QUERY (TEXT-ONLY): ${query}

INSTRUCTIONS:
1. This is a text-only query without any Excel files attached
2. Provide helpful information about Excel or data analysis related to the query
3. If the query requires file analysis, explain that files need to be uploaded
4. Suggest how the user could better utilize the Excel assistant with file uploads
5. Focus on providing educational content about Excel features, functions, or best practices

ADDITIONAL CONTEXT:
This query is part of chat session: ${sessionId}
    `.trim();

    // Create thread message
    const message = await openai.beta.threads.messages.create(
      threadId,
      {
        role: "user",
        content: [{ type: "text", text: messageContentText }],
        metadata: {
          user_id: String(userId),
          message_type: "text_only_query",
          session_id: String(sessionId),
          is_text_only: "true"
        }
      },
      { headers: v2Headers }
    );

    // Update database with thread message ID
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'processing',
      thread_message_id: message.id,
      is_text_only: true
    });

    // Create run
    console.log('Creating run for text-only query with assistant:', assistantId);
    const run = await openai.beta.threads.runs.create(
      threadId,
      {
        assistant_id: assistantId,
        instructions: `
This is a text-only query with no Excel files attached.

If the user is asking:
- General Excel usage questions: Provide clear, helpful guidance
- How to use specific Excel features: Explain with examples
- Analysis-related questions: Explain approaches without referencing their specific files
- How to upload files: Explain they can upload Excel files for analysis
- Questions that require specific file analysis: Explain you need their files to provide analysis

Be courteous and helpful, treating this as an opportunity to educate on Excel or guide them to upload relevant files.
        `
      },
      { headers: v2Headers }
    );

    return {
      threadId,
      runId: run.id,
      messageId
    };
  } catch (error) {
    console.error('Error in processTextOnlyQueryWithOpenAI:', error);
    throw new ExcelAssistantError(
      `Failed to process text-only query: ${error.message}`,
      500,
      'text_only_processing'
    );
  }
}

/**
 * Process request with improved validation and error handling
 */
async function processRequest(req: Request): Promise<Response> {
  try {
    // Parse request body
    const requestData: RequestData = await req.json();
    
    // Check required fields
    if (!requestData.query?.trim()) {
      return new Response(
        JSON.stringify({ error: 'No query provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    
    if (!requestData.userId) {
      return new Response(
        JSON.stringify({ error: 'No user ID provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    
    if (!requestData.sessionId) {
      return new Response(
        JSON.stringify({ error: 'No session ID provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    
    if (!requestData.messageId) {
      return new Response(
        JSON.stringify({ error: 'No message ID provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    
    // Check if this is a text-only query
    const isTextOnly = !requestData.fileIds || requestData.fileIds.length === 0;
    console.log(`Processing ${isTextOnly ? 'text-only' : 'file-based'} query`);
    
    // Process with Claude
    const result = await processWithClaude({
      query: requestData.query,
      fileContents: [], // Empty array for text-only queries
      messageId: requestData.messageId,
      sessionId: requestData.sessionId,
      userId: requestData.userId,
      isTextOnly: true
    });
    
    // Return response in the format expected by the worker
    return new Response(
      JSON.stringify({ 
        content: result.content,
        metadata: {
          modelUsed: result.modelUsed,
          usage: result.usage,
          isTextOnly: true,
          processingTime: Date.now()
        }
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );
  } catch (error) {
    console.error('Error processing request:', error);
    
    const statusCode = error instanceof ExcelAssistantError ? error.status : 500;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStage = error instanceof ExcelAssistantError ? error.stage : 'unknown';
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        metadata: {
          stage: errorStage,
          timestamp: new Date().toISOString()
        }
      }),
      { 
        status: statusCode, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );
  }
}

/**
 * Handle OPTIONS requests for CORS
 */
function handleOptions(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

/**
 * Main handler for the edge function
 */
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleOptions(req);
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
  
  return processRequest(req);
});

// Define message status stages
const MessageStatus = {
  QUEUED: 'queued',           // Initial state when message is added to Redis
  PROCESSING: 'processing',    // Worker has picked up the message
  ANALYZING: 'analyzing',      // Excel Assistant is processing
  COMPLETED: 'completed',      // Successfully processed
  FAILED: 'failed',           // Error occurred
  CANCELLED: 'cancelled',      // Message processing was cancelled
  EXPIRED: 'expired'          // Message processing timed out
} as const;

/**
 * Update message status in the database with proper stage tracking
 */
async function updateMessageStatus(
  messageId: string,
  status: string,
  content: string = '',
  metadata: Record<string, any> = {}
) {
  try {
    // Allow all valid message statuses
    const allowedStages = [
      MessageStatus.PROCESSING,
      MessageStatus.ANALYZING,
      MessageStatus.COMPLETED,
      MessageStatus.FAILED
    ];
    
    if (!allowedStages.includes(status)) {
      console.warn(`Excel Assistant should not update message to status: ${status}`);
      return;
    }

    // Prepare the update payload
    const updatePayload = {
      status,
      metadata: {
        ...metadata,
        processing_stage: {
          ...(metadata.processing_stage || {}),
          stage: status,
          updated_at: Date.now(),
          updated_by: 'excel_assistant'
        }
      }
    };

    // Only update content if it's provided
    if (content) {
      updatePayload.content = content;
    }

    // Update the message in the database
    const { error } = await supabase
      .from('chat_messages')
      .update(updatePayload)
      .eq('id', messageId);

    if (error) {
      console.error('Error updating message status:', error);
      throw error;
    }

    console.log(`Successfully updated message ${messageId} to status: ${status}`);
  } catch (error) {
    console.error('Error in updateMessageStatus:', error);
    throw error;
  }
}
