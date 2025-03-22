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
 * Update message status in database with better error handling
 */
async function updateMessageStatus(
  messageId: string, 
  status: string, 
  content: string = '', 
  metadata: Record<string, any> = {}
): Promise<void> {
  if (!messageId) {
    console.warn('No messageId provided to updateMessageStatus');
    return;
  }
  
  console.log(`Updating message ${messageId} to status: ${status}`);
  
  try {
    const updateData: Record<string, any> = {
      status,
      metadata: {
        ...metadata,
        processing_stage: {
          stage: status === 'processing' ? metadata.stage || 'generating' : status,
          last_updated: Date.now()
        }
      }
    };
    
    if (content) {
      updateData.content = content;
    }
    
    if (metadata.openai_message_id) {
      updateData.openai_message_id = metadata.openai_message_id;
    }
    
    if (metadata.claude_message_id) {
      updateData.claude_message_id = metadata.claude_message_id;
    }
    
    if (metadata.thread_message_id) {
      updateData.thread_message_id = metadata.thread_message_id;
    }
    
    if (metadata.openai_run_id) {
      updateData.openai_run_id = metadata.openai_run_id;
    }

    const { error } = await supabase
      .from('chat_messages')
      .update(updateData)
      .eq('id', messageId);

    if (error) {
      console.error('Error updating message status:', error);
      throw new ExcelAssistantError(`Failed to update message status: ${error.message}`, 500, 'database');
    }
  } catch (error) {
    console.error('Error in updateMessageStatus:', error);
    // Don't throw here to prevent cascading failures
  }
}

/**
 * Improved assistant creation with better error handling and caching
 */
async function getOrCreateAssistant() {
  if (USE_CLAUDE || !openai) {
    throw new ExcelAssistantError(
      'OpenAI assistant creation attempted when Claude is enabled',
      500,
      'configuration',
      false
    );
  }
  
  console.log('Getting or creating assistant with v2 API...');
  
  try {
    // Check for existing assistant ID in database - more efficient than listing all assistants
    const { data: assistantSettings, error: settingsError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'excel_assistant_id')
      .maybeSingle();
      
    if (!settingsError && assistantSettings?.value) {
      try {
        // Validate assistant exists with OpenAI
        const existingAssistant = await openai.beta.assistants.retrieve(
          assistantSettings.value,
          { headers: v2Headers }
        );
        console.log('Using existing assistant from settings:', existingAssistant.id);
        return existingAssistant;
      } catch (retrieveError) {
        console.warn('Cached assistant ID invalid, creating new one:', retrieveError);
      }
    }
    
    // Fallback: list assistants to find existing one with correct name
    const assistants = await openai.beta.assistants.list({
      limit: 100,
    }, { headers: v2Headers });
    
    const existingAssistant = assistants.data.find(
      assistant => assistant.name === "Excel Analysis Assistant"
    );
    
    if (existingAssistant) {
      console.log('Found existing assistant:', existingAssistant.id);
      
      // Save assistant ID in database for future use
      await supabase
        .from('system_settings')
        .upsert({ 
          key: 'excel_assistant_id', 
          value: existingAssistant.id,
          updated_at: new Date().toISOString()
        });
        
      return existingAssistant;
    }
    
    // Create new assistant with detailed instructions
    console.log('Creating new assistant with v2 API...');
    const instructions = `
You are a specialized Excel spreadsheet analysis assistant. Your primary role is to analyze Excel files, interpret data, explain formulas, suggest improvements, and assist with any Excel-related tasks.

GUIDELINES:
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

4. Visualizations:
   - When creating visualizations with code interpreter, select appropriate chart types
   - Ensure charts have clear labels, titles, and legends
   - Choose color schemes that highlight the important data points
   - Always explain what the visualization shows in your text response

5. Multi-File Analysis:
   - When dealing with multiple files, consider relationships between them
   - Look for common fields that might allow joining datasets
   - Note differences in structure or data quality between files
   - Suggest ways to consolidate or compare information across files

When appropriate, use the code interpreter to perform calculations, generate visualizations, or process data from the Excel files. Always aim to be clear, concise, and helpful.
    `.trim();
    
    const newAssistant = await openai.beta.assistants.create({
      name: "Excel Analysis Assistant",
      instructions,
      model: OPENAI_MODEL,
      tools: [
        { type: "retrieval" },
        { type: "code_interpreter" }
      ]
    }, { headers: v2Headers });
    
    console.log('Created new assistant:', newAssistant.id);
    
    // Save assistant ID in database
    await supabase
      .from('system_settings')
      .upsert({ 
        key: 'excel_assistant_id', 
        value: newAssistant.id,
        updated_at: new Date().toISOString()
      });
    
    return newAssistant;
  } catch (error) {
    console.error('Error in getOrCreateAssistant:', error);
    throw new ExcelAssistantError(
      `Failed to create or get assistant: ${error.message}`, 
      500, 
      'assistant_creation',
      true
    );
  }
}

/**
 * Get or create thread with improved caching and validation
 */
async function getOrCreateThread(sessionId: string) {
  if (USE_CLAUDE) {
    // For Claude, we don't need threads, but return a placeholder to maintain interface compatibility
    return {
      threadId: null,
      assistantId: null,
      isNew: true
    };
  }
  
  if (!openai) {
    throw new ExcelAssistantError(
      'OpenAI thread creation attempted without initialized client',
      500,
      'configuration',
      false
    );
  }
  
  console.log('Getting thread for session:', sessionId);
  
  try {
    // Get session info with thread_id and assistant_id
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('thread_id, assistant_id')
      .eq('session_id', sessionId)
      .maybeSingle();
      
    if (sessionError) {
      throw new ExcelAssistantError(
        `Error fetching session: ${sessionError.message}`, 
        500, 
        'database',
        true
      );
    }
    
    // If thread exists, validate it
    if (session?.thread_id) {
      try {
        await openai.beta.threads.retrieve(session.thread_id, {
          headers: v2Headers
        });
        
        // Check if assistant exists and matches the session
        const assistant = session.assistant_id ? 
          await openai.beta.assistants.retrieve(session.assistant_id, { headers: v2Headers }) : 
          await getOrCreateAssistant();
        
        return {
          threadId: session.thread_id,
          assistantId: assistant.id,
          isNew: false
        };
      } catch (threadError) {
        console.warn('Existing thread invalid, creating new one:', threadError.message);
      }
    }
    
    // Create new thread
    console.log('Creating new thread...');
    const newThread = await openai.beta.threads.create({}, {
      headers: v2Headers
    });
    
    // Get or create assistant
    const assistant = await getOrCreateAssistant();
    
    // Update session with thread and assistant IDs
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({
        thread_id: newThread.id,
        assistant_id: assistant.id,
        openai_model: OPENAI_MODEL,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId);
      
    if (updateError) {
      console.error('Error updating session with thread ID:', updateError);
      throw new ExcelAssistantError(
        `Failed to update session: ${updateError.message}`,
        500,
        'database',
        true
      );
    }
    
    return {
      threadId: newThread.id,
      assistantId: assistant.id,
      isNew: true
    };
  } catch (error) {
    if (error instanceof ExcelAssistantError) {
      throw error;
    }
    
    console.error('Error in getOrCreateThread:', error);
    throw new ExcelAssistantError(
      `Thread creation failed: ${error.message}`,
      500,
      'thread_creation',
      true
    );
  }
}

/**
 * Process Excel files with improved file metadata extraction
 */
async function processExcelFiles(fileIds: string[]): Promise<ExcelFile[]> {
  console.log('Processing Excel files:', fileIds);
  
  if (!fileIds || !fileIds.length) {
    throw new ExcelAssistantError('No file IDs provided', 400, 'input_validation', false);
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
 * Utility for retrying operations with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>, 
  maxRetries = MAX_RETRIES,
  initialDelay = RETRY_DELAY,
  stage = 'unknown'
): Promise<T> {
  let lastError: Error | null = null;
  let delay = initialDelay;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // If error is explicitly marked as not retryable, throw immediately
      if (error instanceof ExcelAssistantError && !error.retryable) {
        throw error;
      }
      
      if (attempt >= maxRetries) {
        break;
      }
      
      console.warn(`Retry attempt ${attempt + 1}/${maxRetries} for stage "${stage}" after error:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Exponential backoff with jitter
      delay = delay * 1.5 + Math.random() * 300;
    }
  }
  
  throw lastError || new ExcelAssistantError(`Max retries (${maxRetries}) exceeded in stage ${stage}`, 500, stage);
}

/**
 * Check file cache and return cached metadata if valid
 */
function getFromFileCache(fileId: string): any | null {
  const cachedItem = fileMetadataCache.get(fileId);
  
  if (!cachedItem) {
    return null;
  }
  
  // Check if cache is still valid
  const now = Date.now();
  if (now - cachedItem.timestamp > FILE_CACHE_TTL) {
    fileMetadataCache.delete(fileId);
    return null;
  }
  
  return cachedItem.data;
}

/**
 * Store file metadata in cache
 */
function storeInFileCache(fileId: string, data: any): void {
  fileMetadataCache.set(fileId, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Parse Excel files to extract sheet data with better error handling and caching
 */
async function extractExcelFileContent(files: ExcelFile[]): Promise<FileContent[]> {
  console.log('Extracting content from Excel files...');
  
  const fileContents: FileContent[] = [];
  
  for (const file of files) {
    try {
      // Check cache first
      const cachedContent = getFromFileCache(file.id);
      if (cachedContent) {
        console.log(`Using cached content for ${file.filename}`);
        fileContents.push(cachedContent);
        continue;
      }
      
      // Check for existing metadata in database
      const { data: metadata } = await supabase
        .from('file_metadata')
        .select('column_definitions, data_summary, row_count')
        .eq('file_id', file.id)
        .maybeSingle();
        
      if (metadata?.column_definitions && metadata?.data_summary) {
        // Use cached metadata from database
        console.log(`Using database metadata for ${file.filename}`);
        const content = {
          filename: file.filename,
          sheets: [{
            name: 'Sheet1',
            rowCount: metadata.row_count || metadata.data_summary.length,
            columnCount: Object.keys(metadata.column_definitions).length,
            preview: metadata.data_summary.slice(0, 5)
          }]
        };
        
        // Store in memory cache for faster access next time
        storeInFileCache(file.id, content);
        fileContents.push(content);
        continue;
      }
      
      // Download file from storage with retry
      const { data: fileData, error: downloadError } = await withRetry(
        () => supabase.storage.from('excel_files').download(file.file_path),
        3,
        500,
        'file_download'
      );
        
      if (downloadError || !fileData) {
        console.error(`Error downloading file ${file.filename}:`, downloadError);
        fileContents.push({
          filename: file.filename,
          sheets: [{ 
            name: 'Error', 
            rowCount: 0, 
            columnCount: 0, 
            preview: [{ error: `Failed to download file: ${downloadError?.message || 'Unknown error'}` }] 
          }]
        });
        continue;
      }
      
      // Process file using XLSX with chunking for large files
      console.log(`Processing file ${file.filename} (${(file.file_size / 1024).toFixed(1)} KB)`);
      
      // Handle large files with chunking
      const isLargeFile = file.file_size > 5 * 1024 * 1024; // 5MB threshold
      
      const arrayBuffer = await fileData.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { 
        type: 'array',
        cellDates: true,
        cellFormula: true,
        cellStyles: true,
        // For large files, be more selective about what we parse
        ...(isLargeFile ? {
          sheetRows: 500, // Limit number of rows processed for large files
          bookDeps: false, // Don't track dependencies for large files
          bookFiles: false, // Don't track file references for large files
          bookVBA: false // Don't process VBA for large files
        } : {})
      });
      
      const sheets: SheetData[] = [];
      
      for (const sheetName of workbook.SheetNames) {
        try {
          const worksheet = workbook.Sheets[sheetName];
          
          // Handle empty sheets
          if (!worksheet['!ref']) {
            sheets.push({
              name: sheetName,
              rowCount: 0,
              columnCount: 0,
              preview: []
            });
            continue;
          }
          
          // Extract formula information
          const formulas = new Map<string, string>();
          for (const cellName in worksheet) {
            if (cellName[0] !== '!') {
              const cell = worksheet[cellName];
              if (cell.f) {
                formulas.set(cellName, cell.f);
              }
            }
          }
          
          // Convert sheet to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            defval: null,
            // For large files, we read in batches
            ...(isLargeFile ? { range: 0 } : {})
          });
          
          if (jsonData.length === 0) {
            sheets.push({
              name: sheetName,
              rowCount: 0,
              columnCount: 0,
              preview: []
            });
            continue;
          }
          
          const headers = Object.keys(jsonData[0]);
          const columnDefinitions = headers.reduce((acc, header) => {
            // Determine type based on first non-null value
            let type = 'string';
            for (const row of jsonData) {
              if (row[header] !== null) {
                const valType = typeof row[header];
                if (valType === 'number') type = 'number';
                else if (valType === 'boolean') type = 'boolean';
                else if (row[header] instanceof Date) type = 'date';
                break;
              }
            }
            
            acc[header] = {
              type,
              nullable: jsonData.some(row => row[header] === null),
              hasFormulas: Array.from(formulas.keys()).some(cellName => {
                // Check if any formulas are in this column
                const colLetter = cellName.replace(/[0-9]/g, '');
                return XLSX.utils.encode_col(XLSX.utils.decode_col(colLetter)) === 
                      XLSX.utils.encode_col(headers.indexOf(header));
              })
            };
            return acc;
          }, {} as Record<string, { type: string; nullable: boolean; hasFormulas: boolean }>);
          
          // Calculate row count from worksheet reference
          // This is more accurate than jsonData.length for sheets with empty rows
          let rowCount = jsonData.length;
          if (worksheet['!ref']) {
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            rowCount = range.e.r - range.s.r + 1;
          }
          
          // Enhanced metadata
          const enhancedMetadata = {
            file_id: file.id,
            column_definitions: columnDefinitions,
            data_summary: jsonData.slice(0, 100),
            row_count: rowCount,
            formulas: Object.fromEntries(formulas),
            sheet_names: workbook.SheetNames,
            updated_at: new Date().toISOString()
          };
          
          // Store enhanced metadata
          await supabase
            .from('file_metadata')
            .upsert(enhancedMetadata);
          
          sheets.push({
            name: sheetName,
            rowCount,
            columnCount: headers.length,
            preview: jsonData.slice(0, 5),
            formulas: Object.fromEntries(formulas)
          });
        } catch (sheetError) {
          console.error(`Error processing sheet ${sheetName}:`, sheetError);
          sheets.push({
            name: sheetName,
            rowCount: 0,
            columnCount: 0,
            preview: [{ error: `Failed to process sheet: ${sheetError.message}` }]
          });
        }
      }
      
      const content = {
        filename: file.filename,
        sheets
      };
      
      // Store in memory cache
      storeInFileCache(file.id, content);
      fileContents.push(content);
      
    } catch (error) {
      console.error(`Error extracting content from file ${file.filename}:`, error);
      fileContents.push({
        filename: file.filename,
        sheets: [{ 
          name: 'Error', 
          rowCount: 0, 
          columnCount: 0, 
          preview: [{ error: `Failed to process file: ${error.message || 'Unknown error'}` }] 
        }]
      });
    }
  }
  
  return fileContents;
}

/**
 * Download and prepare files for the assistant with improved handling
 */
async function prepareFilesForAssistant(files: ExcelFile[]) {
  if (USE_CLAUDE || !openai) {
    console.log('Skipping OpenAI file upload since Claude is enabled');
    return [];
  }
  
  try {
    console.log('Preparing files for assistant...');
    
    const openaiFiles = [];
    
    for (const file of files) {
      try {
        // Download file from Supabase storage with retry
        console.log(`Downloading file from storage: ${file.filename}`);
        const { data: fileContent, error: downloadError } = await withRetry(
          () => supabase.storage.from('excel_files').download(file.file_path),
          3,
          500,
          'file_download'
        );
        
        if (downloadError || !fileContent) {
          console.error(`Error downloading file ${file.filename}:`, downloadError);
          continue;
        }
        
        // Determine MIME type based on file extension
        let mimeType = 'application/octet-stream';
        if (file.filename.toLowerCase().endsWith('.xlsx')) {
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else if (file.filename.toLowerCase().endsWith('.xls')) {
          mimeType = 'application/vnd.ms-excel';
        } else if (file.filename.toLowerCase().endsWith('.csv')) {
          mimeType = 'text/csv';
        }
        
        const blob = new Blob([fileContent], { type: mimeType });
        
        // Upload file to OpenAI with retry
        console.log(`Uploading ${file.filename} to OpenAI...`);
        const openaiFile = await withRetry(
          () => openai.files.create({
            file: new File([blob], file.filename),
            purpose: 'assistants'
          }),
          3,
          500,
          'openai_file_upload'
        );
        
        console.log(`File uploaded to OpenAI: ${openaiFile.id}`);
        openaiFiles.push(openaiFile);
        
        // Store the OpenAI file ID in our database for future reference
        await supabase.from('file_openai_mapping').upsert({
          file_id: file.id,
          openai_file_id: openaiFile.id,
          created_at: new Date().toISOString()
        });
      } catch (fileError) {
        console.error(`Error processing file ${file.filename}:`, fileError);
        // Continue with other files
      }
    }
    
    return openaiFiles;
  } catch (error) {
    console.error('Error in prepareFilesForAssistant:', error);
    throw new ExcelAssistantError(
      `Failed to prepare files for assistant: ${error.message}`,
      500,
      'file_upload',
      true
    );
  }
}

/**
 * Improved file attachment with better metadata handling
 */
async function attachFilesToThread({
  threadId,
  messageContent,
  fileIds,
  userId,
  metadata = {}
}: {
  threadId: string;
  messageContent: string;
  fileIds: string[];
  userId: string;
  metadata?: Record<string, any>;
}) {
  if (!threadId || !openai) {
    throw new ExcelAssistantError(
      'Cannot attach files to thread without valid threadId or OpenAI client',
      500,
      'configuration',
      false
    );
  }
  
  try {
    console.log(`Attaching ${fileIds.length} file(s) to thread ${threadId}`);

    // Convert all metadata values to strings (OpenAI requirement)
    const stringifyMetadata = (metadataObj: Record<string, any>): Record<string, string> => {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(metadataObj)) {
        result[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
      return result;
    };

    const threadMessages = [];

    if (fileIds.length === 1) {
      console.log(`Attaching single file (${fileIds[0]}) to message.`);
      const message = await withRetry(
        () => openai.beta.threads.messages.create(
          threadId,
          {
            role: "user",
            content: [{ type: "text", text: messageContent }],
            attachments: [{ 
              file_id: fileIds[0], 
              tools: [{ type: "code_interpreter" }] 
            }],
            metadata: stringifyMetadata({
              user_id: userId,
              message_type: "excel_query",
              is_multi_file: "false",
              ...metadata
            })
          },
          { headers: v2Headers }
        ),
        3,
        500,
        'message_creation'
      );
      threadMessages.push(message);
    } else {
      console.log(`Sending first message with user query and primary file.`);
      const primaryMessage = await withRetry(
        () => openai.beta.threads.messages.create(
          threadId,
          {
            role: "user",
            content: [{ type: "text", text: `${messageContent}\n\n[Part 1 of ${fileIds.length} messages]` }],
            attachments: [{ 
              file_id: fileIds[0], 
              tools: [{ type: "code_interpreter" }] 
            }],
            metadata: stringifyMetadata({
              user_id: userId,
              message_type: "excel_query",
              is_multi_file: "true",
              file_index: "0",
              total_files: String(fileIds.length),
              ...metadata
            })
          },
          { headers: v2Headers }
        ),
        3,
        500,
        'message_creation'
      );
      threadMessages.push(primaryMessage);

      console.log(`Attaching additional ${fileIds.length - 1} files separately.`);
      const additionalMessages = await Promise.all(
        fileIds.slice(1).map(async (fileId, index) => {
          return withRetry(
            () => openai.beta.threads.messages.create(
              threadId,
              {
                role: "user",
                content: [{ type: "text", text: `Additional file ${index + 2} of ${fileIds.length}` }],
                attachments: [{ 
                  file_id: fileId, 
                  tools: [{ type: "code_interpreter" }] 
                }],
                metadata: stringifyMetadata({
                  user_id: userId,
                  message_type: "excel_additional_file",
                  is_multi_file: "true",
                  file_index: String(index + 1),
                  total_files: String(fileIds.length),
                  primary_message_id: String(primaryMessage.id),
                  ...metadata
                })
              },
              { headers: v2Headers }
            ),
            3,
            500,
            'message_creation'
          );
        })
      );

      threadMessages.push(...additionalMessages);
    }

    console.log(`Successfully attached ${threadMessages.length} messages with files.`);
    return {
      messages: threadMessages,
      primaryMessageId: threadMessages[0]?.id
    };
  } catch (error) {
    console.error('Error in attachFilesToThread:', error);
    throw new ExcelAssistantError(
      `Failed to attach files to thread: ${error.message}`,
      500,
      'message_creation',
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

    // Attach files to thread with retry logic
    const { messages, primaryMessageId } = await attachFilesToThread({
      threadId,
      messageContent: messageContentText,
      fileIds,
      userId,
      metadata: { 
        query, 
        file_count: fileIds.length,
        session_id: sessionId
      }
    });

    // Update database with thread message ID
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'processing',
      thread_message_id: primaryMessageId,
      file_count: fileIds.length,
      is_multi_file: fileIds.length > 1,
      multi_file_message_ids: fileIds.length > 1 ? messages.map(m => m.id) : undefined
    });

    // Create run with specific instructions and enhanced guidance
    console.log('Creating run with assistant:', assistantId);
    const run = await withRetry(
      () => openai.beta.threads.runs.create(
        threadId,
        {
          assistant_id: assistantId,
          instructions: `
Analyze the Excel files mentioned in the user query.
Focus on providing clear, accurate information about the spreadsheet data.

Use code interpreter to:
- Generate visualizations that help illustrate patterns or trends
- Perform statistical analysis on the data
- Clean and transform data as needed
- Compare datasets across multiple files if present

For complex formulas:
- Explain what they do in plain language
- Break down the logic step by step
- Suggest improvements or alternatives if appropriate

When handling large datasets:
- Focus on summary statistics
- Identify key outliers or anomalies
- Sample representative data for visualizations

Always structure your response with clear headings and organized sections.
`.trim()
        },
        { headers: v2Headers }
      ),
      3,
      500,
      'run_creation'
    );

    // Update message with run ID
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'waiting_for_completion',
      openai_run_id: run.id,
      run_created_at: Date.now()
    });

    // Poll for run completion with improved handling
    let runResult;
    try {
      runResult = await pollRunCompletion(threadId, run.id, messageId);
    } catch (pollError) {
      console.error('Error polling run completion:', pollError);
      
      // Try to cancel the run if possible
      try {
        await openai.beta.threads.runs.cancel(threadId, run.id, { headers: v2Headers });
      } catch (cancelError) {
        console.error('Error canceling run:', cancelError);
      }
      
      throw new ExcelAssistantError(
        `Run polling failed: ${pollError.message}`,
        500,
        'run_polling',
        false
      );
    }

    return {
      threadId,
      runId: run.id,
      messageId,
      fileIds
    };
  } catch (error) {
    console.error('Error in processUserQueryWithOpenAI:', error);
    
    // Update message to failed status
    await updateMessageStatus(messageId, 'failed', '', {
      error: error.message,
      stage: error instanceof ExcelAssistantError ? error.stage : 'openai_processing',
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
 * Poll for run completion with improved error handling and timeout
 */
async function pollRunCompletion(
  threadId: string, 
  runId: string, 
  messageId: string
): Promise<any> {
  if (!openai) {
    throw new ExcelAssistantError(
      'Cannot poll run completion without OpenAI client',
      500,
      'configuration',
      false
    );
  }
  
  console.log(`Polling for run completion: ${runId}`);
  let attempts = 0;
  const startTime = Date.now();
  
  // Enhanced metadata to track progress
  const progressMetadata = {
    status_updates: []
  };
  
  while (attempts < MAX_POLLING_ATTEMPTS) {
    try {
      attempts++;
      
      // Check run status
      const run = await openai.beta.threads.runs.retrieve(
        threadId,
        runId,
        { headers: v2Headers }
      );
      
      // Log progress
      console.log(`Run ${runId} status: ${run.status} (attempt ${attempts}/${MAX_POLLING_ATTEMPTS})`);
      
      // Store progress update
      progressMetadata.status_updates.push({
        timestamp: Date.now(),
        status: run.status,
        attempt: attempts
      });
      
      // Update message with current status
      await updateMessageStatus(messageId, 'processing', '', {
        stage: 'run_' + run.status,
        run_status: run.status,
        run_started_at: startTime,
        elapsed_time: Date.now() - startTime,
        attempts,
        progress_metadata: progressMetadata
      });
      
      // Check for completion
      if (run.status === 'completed') {
        // Get the latest message from the assistant
        const response = await openai.beta.threads.messages.list(
          threadId,
          { headers: v2Headers }
        );
        
        const latestMessage = response.data.find(msg => msg.role === 'assistant');
        
        if (!latestMessage) {
          throw new ExcelAssistantError(
            'No assistant message found after run completion',
            500,
            'run_completion',
            false
          );
        }
        
        // Extract content text
        const contentParts = latestMessage.content.filter(part => part.type === 'text');
        let contentText = '';
        
        for (const part of contentParts) {
          if ('text' in part) {
            contentText += part.text.value + '\n\n';
          }
        }
        
        // Extract any image references
        const imageURLs = latestMessage.content
          .filter(part => part.type === 'image')
          .map(part => 'image_url' in part ? part.image_url.url : '');
        
        // Update message with completion
        await updateMessageStatus(messageId, 'completed', contentText.trim(), {
          completed_at: Date.now(),
          run_id: runId,
          thread_id: threadId,
          openai_message_id: latestMessage.id,
          model_used: OPENAI_MODEL,
          image_urls: imageURLs,
          total_time: Date.now() - startTime
        });
        
        return { message: latestMessage, run };
      }
      
      // Check for failed states
      if (['failed', 'cancelled', 'expired'].includes(run.status)) {
        const errorMessage = run.last_error?.message || `Run ended with status: ${run.status}`;
        
        await updateMessageStatus(messageId, 'failed', '', {
          error: errorMessage,
          run_status: run.status,
          failed_at: Date.now()
        });
        
        throw new ExcelAssistantError(
          `Run failed: ${errorMessage}`,
          500,
          'run_failure',
          false
        );
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    } catch (error) {
      // Don't retry if the error is a retrieval error (run might not exist)
      if (error.status === 404) {
        throw new ExcelAssistantError(
          `Run not found: ${error.message}`,
          404,
          'run_not_found',
          false
        );
      }
      
      console.error(`Error polling run (attempt ${attempts}):`, error);
      
      // For other errors, we retry
      if (attempts >= MAX_POLLING_ATTEMPTS) {
        throw new ExcelAssistantError(
          `Max polling attempts (${MAX_POLLING_ATTEMPTS}) exceeded`,
          500,
          'run_polling_timeout',
          false
        );
      }
      
      // Wait before retrying with longer delay for API errors
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL * 2));
    }
  }
  
  // If we get here, we've exceeded maximum attempts
  throw new ExcelAssistantError(
    `Run polling timed out after ${MAX_POLLING_ATTEMPTS} attempts`,
    500,
    'run_polling_timeout',
    false
  );
}

/**
 * Process request with improved validation and error handling
 */
async function processRequest(req: Request): Promise<Response> {
  try {
    // Parse request body
    const requestData: RequestData = await req.json();
    
    // Check required fields
    if (!requestData.fileIds || !requestData.fileIds.length) {
      return new Response(
        JSON.stringify({ error: 'No file IDs provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    
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
    
    // Process Excel files
    const files = await processExcelFiles(requestData.fileIds);
    
    // Extract content from files
    const fileContents = await extractExcelFileContent(files);
    
    let result: ProcessResult;
    
    if (USE_CLAUDE) {
      // Process with Claude API
      result = await processUserQueryWithClaude({
        query: requestData.query,
        files,
        fileContents,
        messageId: requestData.messageId,
        userId: requestData.userId,
        sessionId: requestData.sessionId
      });
    } else {
      // Get or create thread
      const { threadId, assistantId } = await getOrCreateThread(requestData.sessionId);
      
      // Process with OpenAI API
      result = await processUserQueryWithOpenAI({
        threadId,
        assistantId,
        query: requestData.query,
        files,
        fileContents,
        messageId: requestData.messageId,
        userId: requestData.userId,
        sessionId: requestData.sessionId
      });
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        ...result 
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
        stage: errorStage,
        timestamp: new Date().toISOString()
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
