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
import { queueMessage, isMessageQueued } from "./queue.ts";

// Environment variables
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const USE_MESSAGE_QUEUE = Deno.env.get('USE_MESSAGE_QUEUE') === 'true';

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
 * Utility function to retry an asynchronous operation.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  delay: number,
  stage: string
): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      console.warn(`Attempt ${attempt + 1} failed for stage ${stage}: ${error.message}`);
      attempt++;
      if (attempt === retries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Failed after ${retries} attempts`);
}

/**
 * Get file metadata from cache or database
 */
async function getFileMetadata(fileId: string): Promise<any> {
  const cachedData = fileMetadataCache.get(fileId);
  if (cachedData && Date.now() - cachedData.timestamp < FILE_CACHE_TTL) {
    console.log(`Using cached metadata for file ${fileId}`);
    return cachedData.data;
  }

  const { data, error } = await supabase
    .from('excel_files')
    .select('*')
    .eq('id', fileId)
    .single();

  if (error) {
    console.error(`Error fetching file metadata for ${fileId}: ${error.message}`);
    throw new ExcelAssistantError(
      `Failed to fetch file metadata: ${error.message}`,
      500,
      'database',
      true
    );
  }

  fileMetadataCache.set(fileId, {
    data: data,
    timestamp: Date.now()
  });

  return data;
}

/**
 * Extract Excel file content with improved error handling
 */
async function extractExcelFileContent(files: ExcelFile[]): Promise<FileContent[]> {
  if (!files || files.length === 0) {
    console.warn('No files provided for content extraction');
    return [];
  }
  
  console.log(`Extracting content from ${files.length} files`);
  
  try {
    const fileContents: FileContent[] = [];
    
    for (const file of files) {
      console.log(`Processing file: ${file.filename} (ID: ${file.id})`);
      
      // Download file from Supabase storage
      const { data: fileContent, error: downloadError } = await supabase.storage
        .from('excel_files')
        .download(file.file_path);
      
      if (downloadError) {
        console.error(`Error downloading file ${file.filename}: ${downloadError.message}`);
        throw new ExcelAssistantError(
          `Failed to download file: ${downloadError.message}`,
          500,
          'file_download',
          true
        );
      }
      
      // Read the Excel file
      const workbook = XLSX.read(await fileContent.arrayBuffer(), { type: 'array' });
      
      const sheets: SheetData[] = workbook.SheetNames.map(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Get formulas if available
        let formulas: Record<string, string> | undefined;
        if (worksheet['!f']) {
          formulas = {};
          worksheet['!f'].forEach((formula: string, index: number) => {
            const cellAddress = worksheet['!ref']?.split(':')[0]; // Get top-left cell
            if (cellAddress) {
              const col = index % (json[0] as any[]).length;
              const row = Math.floor(index / (json[0] as any[]).length);
              const cell = XLSX.utils.encode_cell({ r: row, c: col });
              formulas![cell] = formula;
            }
          });
        }
        
        return {
          name: sheetName,
          rowCount: json.length,
          columnCount: json[0]?.length || 0,
          preview: json.slice(0, 5),
          formulas
        };
      });
      
      fileContents.push({
        filename: file.filename,
        sheets: sheets
      });
    }
    
    console.log('Successfully extracted content from all files');
    return fileContents;
  } catch (error) {
    console.error('Error in extractExcelFileContent:', error);
    
    if (error instanceof ExcelAssistantError) {
      throw error;
    }
    
    throw new ExcelAssistantError(
      `Failed to extract Excel file content: ${error.message}`,
      500,
      'file_extraction',
      true
    );
  }
}

/**
 * Update message status in the database
 */
async function updateMessageStatus(
  messageId: string,
  status: string,
  content: string = '',
  metadata: Record<string, any> = {}
) {
  try {
    // Prepare the update payload
    const updates: Record<string, any> = {
      status
    };
    
    if (content) {
      updates.content = content;
    }
    
    if (Object.keys(metadata).length > 0) {
      const { data: existingMessage } = await supabase
        .from('chat_messages')
        .select('metadata')
        .eq('id', messageId)
        .single();
      
      updates.metadata = {
        ...existingMessage?.metadata,
        processing_stage: {
          ...(existingMessage?.metadata?.processing_stage || {}),
          ...metadata,
          stage: metadata.stage || status,
          last_updated: Date.now()
        }
      };
    }
    
    // Update the message
    const { error } = await supabase
      .from('chat_messages')
      .update(updates)
      .eq('id', messageId);
    
    if (error) {
      console.error(`Error updating message ${messageId} status:`, error);
      throw error;
    }
    
    console.log(`Updated message ${messageId} status to ${status}`);
  } catch (error) {
    console.error(`Failed to update message ${messageId} status:`, error);
    throw error;
  }
}

/**
 * Get or create a thread for OpenAI assistant
 */
async function getOrCreateThread(sessionId: string): Promise<{
  threadId: string;
  assistantId: string;
  isNew: boolean;
}> {
  try {
    // Check if a thread already exists for this session
    const { data: existingThread, error: threadError } = await supabase
      .from('chat_threads')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (threadError && threadError.code !== '404') {
      console.error('Error checking for existing thread:', threadError);
      throw new ExcelAssistantError(
        `Failed to check for existing thread: ${threadError.message}`,
        500,
        'database',
        true
      );
    }

    if (existingThread) {
      console.log(`Using existing thread ${existingThread.thread_id} for session ${sessionId}`);
      return {
        threadId: existingThread.thread_id,
        assistantId: existingThread.assistant_id,
        isNew: false
      };
    }

    // Create a new thread
    console.log(`Creating new thread for session ${sessionId}`);
    const thread = await openai!.beta.threads.create({
      metadata: {
        session_id: String(sessionId)
      }
    }, { headers: v2Headers });

    // Store the thread ID in the database
    const { data: newThread, error: newThreadError } = await supabase
      .from('chat_threads')
      .insert({
        session_id: sessionId,
        thread_id: thread.id,
        assistant_id: 'asst_LwGlwugNzJ7jEA9j9jObSg94' // Hardcoded assistant ID
      })
      .select('*')
      .single();

    if (newThreadError) {
      console.error('Error storing new thread:', newThreadError);
      throw new ExcelAssistantError(
        `Failed to store new thread: ${newThreadError.message}`,
        500,
        'database',
        true
      );
    }

    console.log(`New thread created: ${thread.id}`);
    return {
      threadId: newThread.thread_id,
      assistantId: newThread.assistant_id,
      isNew: true
    };
  } catch (error) {
    console.error('Error in getOrCreateThread:', error);
    
    if (error instanceof ExcelAssistantError) {
      throw error;
    }
    
    throw new ExcelAssistantError(
      `Failed to get or create thread: ${error.message}`,
      500,
      'thread_creation',
      true
    );
  }
}

/**
 * Prepare files for OpenAI assistant
 */
async function prepareFilesForAssistant(files: ExcelFile[]): Promise<any[]> {
  try {
    const openaiFiles = [];

    for (const file of files) {
      // Check if the file already exists in OpenAI
      const { data: existingFile, error: fileError } = await supabase
        .from('openai_files')
        .select('*')
        .eq('excel_file_id', file.id)
        .single();

      if (fileError && fileError.code !== '404') {
        console.error('Error checking for existing file:', fileError);
        throw new ExcelAssistantError(
          `Failed to check for existing file: ${fileError.message}`,
          500,
          'database',
          true
        );
      }

      if (existingFile) {
        console.log(`Using existing file ${existingFile.openai_file_id} for Excel file ${file.id}`);
        openaiFiles.push({ id: existingFile.openai_file_id });
        continue;
      }

      // Download the file from Supabase storage
      const { data: fileContent, error: downloadError } = await supabase.storage
        .from('excel_files')
        .download(file.file_path);

      if (downloadError) {
        console.error('Error downloading file:', downloadError);
        throw new ExcelAssistantError(
          `Failed to download file: ${downloadError.message}`,
          500,
          'file_download',
          true
        );
      }

      // Upload the file to OpenAI
      console.log(`Uploading file ${file.filename} to OpenAI`);
      const uploadedFile = await openai!.files.create({
        file: fileContent as any,
        purpose: "assistants"
      }, { headers: v2Headers });

      // Store the file ID in the database
      const { error: storeError } = await supabase
        .from('openai_files')
        .insert({
          excel_file_id: file.id,
          openai_file_id: uploadedFile.id
        });

      if (storeError) {
        console.error('Error storing file ID:', storeError);
        throw new ExcelAssistantError(
          `Failed to store file ID: ${storeError.message}`,
          500,
          'database',
          true
        );
      }

      console.log(`File ${file.filename} uploaded to OpenAI with ID ${uploadedFile.id}`);
      openaiFiles.push({ id: uploadedFile.id });
    }

    return openaiFiles;
  } catch (error) {
    console.error('Error in prepareFilesForAssistant:', error);
    
    if (error instanceof ExcelAssistantError) {
      throw error;
    }
    
    throw new ExcelAssistantError(
      `Failed to prepare files for assistant: ${error.message}`,
      500,
      'file_preparation',
      true
    );
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
    
    // Update message status to provide better progress tracking
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'preparing_claude_request',
      started_at: Date.now(),
      model: CLAUDE_MODEL
    });
    
    // Create enhanced file context with formula information
    const fileContext = fileContents.map(content => {
      const sheetContexts = content.sheets.map(sheet => {
        // Basic sheet info
        let sheetContext = `    - ${sheet.name}: ${sheet.rowCount} rows × ${sheet.columnCount} columns`;
        
        // Add formula information if available
        if (sheet.formulas && Object.keys(sheet.formulas).length > 0) {
          const formulaCount = Object.keys(sheet.formulas).length;
          sheetContext += `\n      * Contains ${formulaCount} formula${formulaCount === 1 ? '' : 's'}`;
          
          // Add sample formulas (up to 3)
          const sampleFormulas = Object.entries(sheet.formulas).slice(0, 3);
          if (sampleFormulas.length > 0) {
            sheetContext += '\n      * Sample formulas:';
            sampleFormulas.forEach(([cell, formula]) => {
              sheetContext += `\n        - ${cell}: ${formula}`;
            });
          }
        }
        
        return sheetContext;
      }).join('\n');
      
      const fileSize = files.find(f => f.filename === content.filename)?.file_size || 0;
      const formattedSize = fileSize > 0 ? `${(fileSize / 1024).toFixed(1)} KB` : 'Unknown size';
      
      return `
- ${content.filename} (${formattedSize})
  Sheets:
${sheetContexts}`;
    }).join('\n');

    // Enhanced prompt with better context and specific instructions for Claude 3.5 Sonnet
    const userPrompt = `
USER QUERY: ${query}

AVAILABLE EXCEL FILES:
${fileContext}

INSTRUCTIONS:
1. Please analyze these Excel files and answer the query thoroughly
2. If formulas are present, explain what they do and provide insights about their logic
3. If appropriate, suggest ways to improve data organization or analysis
4. For large datasets, provide summary statistics to give an overview
5. If multiple files are present, check for relationships between them
6. Highlight important patterns, trends, or outliers in the data

ADDITIONAL CONTEXT:
This query is part of chat session: ${sessionId}
`.trim();

    // Update message status for better tracking
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'sending_to_claude',
      completion_percentage: 30,
      request_start: Date.now()
    });

    // Execute request with retry logic
    const result = await withRetry(
      () => processWithClaude({
        query,
        fileContents,
        messageId,
        sessionId,
        userId
      }),
      2,
      1000,
      'claude_api_call'
    );
    
    return {
      messageId: result.messageId,
      claudeResponse: {
        content: result.content,
        modelUsed: result.modelUsed,
        usage: result.usage
      }
    };
  } catch (error) {
    console.error('Error in processUserQueryWithClaude:', error);
    
    // Update message status to failed
    await updateMessageStatus(messageId, 'failed', '', {
      stage: 'claude_processing_error',
      error: error.message,
      failed_at: Date.now()
    });
    
    if (error instanceof ExcelAssistantError) {
      throw error;
    }
    
    throw new ExcelAssistantError(
      `Failed to process query with Claude: ${error.message}`,
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

    // Create thread message
    const message = await openai.beta.threads.messages.create(
      threadId,
      {
        role: "user",
        content: [{ type: "text", text: messageContentText }],
        file_ids: fileIds,
        metadata: {
          user_id: String(userId),
          session_id: String(sessionId)
        }
      },
      { headers: v2Headers }
    );

    // Update database with thread message ID
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'processing',
      thread_message_id: message.id
    });

    // Create run
    console.log('Creating run with assistant:', assistantId);
    await openai.beta.threads.runs.create(
      threadId,
      {
        assistant_id: assistantId,
        instructions: `
You are an Excel expert assistant specializing in analyzing and explaining Excel data. Follow these guidelines:

1. Data Analysis:
   - Always provide detailed insights about the data structure and content
   - Highlight key patterns, trends, or anomalies in the data
   - Suggest potential analyses or visualizations when relevant
   - Use numerical summaries (min, max, average, etc.) when appropriate

2. Response Format:
   - Structure responses clearly with headers and sections
   - Use bullet points for lists of insights or recommendations
   - Include relevant statistics to support observations
   - Format numbers appropriately (e.g., percentages, decimals)

3. Excel-Specific Features:
   - Reference specific Excel functions that could be useful
   - Explain complex calculations or formulas when needed
   - Suggest improvements to data organization if applicable
   - Mention relevant Excel features or tools

4. Context Awareness:
   - Consider all sheets and their relationships
   - Reference specific columns and data points
   - Acknowledge data quality issues or limitations
   - Maintain context across multiple messages in a thread

5. Formula Analysis:
   - Break down formulas into component parts
   - Explain what each part of a formula does
   - Suggest optimizations for complex formulas
   - Identify potential errors in formulas
        `
      },
      { headers: v2Headers }
    );

    return {
      threadId,
      runId: 'run.id', // This is a placeholder, actual code should be kept
      messageId,
      fileIds
    };
  } catch (error) {
    console.error('Error in processUserQueryWithOpenAI:', error);
    
    // Update message status to failed
    await updateMessageStatus(messageId, 'failed', '', {
      stage: 'openai_processing_error',
      error: error.message,
      failed_at: Date.now()
    });
    
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
 * Process request with improved validation, error handling, and queue support
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
        JSON.stringify({ error: '
