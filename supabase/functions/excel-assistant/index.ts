// Import dependencies with specific versions to ensure stability
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import OpenAI from "https://esm.sh/openai@4.20.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

// Environment variables
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const MODEL = "gpt-4-turbo";
const MAX_POLLING_ATTEMPTS = 30;
const POLLING_INTERVAL = 1000; // 1 second

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Re-usable OpenAI v2 header
const v2Headers = {
  "OpenAI-Beta": "assistants=v2"
};

// Initialize clients
if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  defaultHeaders: v2Headers,
  dangerouslyAllowBrowser: true
});

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
  threadId: string;
  runId: string;
  messageId: string;
  fileIds: string[];
}

// Error handling utility
class ExcelAssistantError extends Error {
  status: number;
  stage: string;
  
  constructor(message: string, status = 500, stage = 'unknown') {
    super(message);
    this.name = 'ExcelAssistantError';
    this.status = status;
    this.stage = stage;
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
      model: MODEL,
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
      'assistant_creation'
    );
  }
}

/**
 * Get or create thread with improved caching and validation
 */
async function getOrCreateThread(sessionId: string) {
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
        'database'
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
        openai_model: MODEL,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId);
      
    if (updateError) {
      console.error('Error updating session with thread ID:', updateError);
      throw new ExcelAssistantError(
        `Failed to update session: ${updateError.message}`,
        500,
        'database'
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
      'thread_creation'
    );
  }
}

/**
 * Process Excel files with improved file metadata extraction
 */
async function processExcelFiles(fileIds: string[]): Promise<ExcelFile[]> {
  console.log('Processing Excel files:', fileIds);
  
  if (!fileIds || !fileIds.length) {
    throw new ExcelAssistantError('No file IDs provided', 400, 'input_validation');
  }
  
  try {
    const { data: files, error } = await supabase
      .from('excel_files')
      .select('*')
      .in('id', fileIds);

    if (error) {
      throw new ExcelAssistantError(`Error fetching Excel files: ${error.message}`, 500, 'database');
    }
    
    if (!files?.length) {
      throw new ExcelAssistantError('No files found with the provided IDs', 404, 'not_found');
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
      'file_processing'
    );
  }
}

/**
 * Parse Excel files to extract sheet data with better error handling
 */
async function extractExcelFileContent(files: ExcelFile[]): Promise<FileContent[]> {
  console.log('Extracting content from Excel files...');
  
  const fileContents: FileContent[] = [];
  
  for (const file of files) {
    try {
      // Download file from storage
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('excel_files')
        .download(file.file_path);
        
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
      
      // Check for existing metadata
      const { data: metadata } = await supabase
        .from('file_metadata')
        .select('column_definitions, data_summary, row_count')
        .eq('file_id', file.id)
        .maybeSingle();
        
      if (metadata?.column_definitions && metadata?.data_summary) {
        // Use cached metadata
        console.log(`Using cached metadata for ${file.filename}`);
        fileContents.push({
          filename: file.filename,
          sheets: [{
            name: 'Sheet1',
            rowCount: metadata.row_count || metadata.data_summary.length,
            columnCount: Object.keys(metadata.column_definitions).length,
            preview: metadata.data_summary.slice(0, 5)
          }]
        });
        continue;
      }
      
      // Process file using XLSX
      const arrayBuffer = await fileData.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { 
        type: 'array',
        cellDates: true,
        cellFormula: true
      });
      
      const sheets: SheetData[] = [];
      
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
        
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
            nullable: jsonData.some(row => row[header] === null)
          };
          return acc;
        }, {} as Record<string, { type: string; nullable: boolean }>);
        
        // Store metadata for future use
        await supabase
          .from('file_metadata')
          .upsert({
            file_id: file.id,
            column_definitions: columnDefinitions,
            data_summary: jsonData.slice(0, 100),
            row_count: jsonData.length,
            updated_at: new Date().toISOString()
          });
        
        sheets.push({
          name: sheetName,
          rowCount: jsonData.length,
          columnCount: headers.length,
          preview: jsonData.slice(0, 5)
        });
      }
      
      fileContents.push({
        filename: file.filename,
        sheets
      });
      
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
 * Download and prepare files for the assistant
 */
async function prepareFilesForAssistant(files: ExcelFile[]) {
  try {
    console.log('Preparing files for assistant...');
    
    const openaiFiles = [];
    
    for (const file of files) {
      try {
        // Download file from Supabase storage
        console.log(`Downloading file from storage: ${file.filename}`);
        const { data: fileContent, error: downloadError } = await supabase.storage
          .from('excel_files')
          .download(file.file_path);
        
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
        
        // Upload file to OpenAI
        console.log(`Uploading ${file.filename} to OpenAI...`);
        const openaiFile = await openai.files.create({
          file: new File([blob], file.filename),
          purpose: 'assistants'
        });
        
        console.log(`File uploaded to OpenAI: ${openaiFile.id}`);
        openaiFiles.push(openaiFile);
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
      'file_upload'
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
  try {
    console.log(`Attaching ${fileIds.length} file(s) to thread ${threadId}`);

    // Convert all metadata values to strings (OpenAI requirement)
    const stringifyMetadata = (metadataObj: Record<string, any>): Record<string, string> => {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(metadataObj)) {
        result[key] = String(value);
      }
      return result;
    };

    const threadMessages = [];

    if (fileIds.length === 1) {
      console.log(`Attaching single file (${fileIds[0]}) to message.`);
      const message = await openai.beta.threads.messages.create(
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
      );
      threadMessages.push(message);
    } else {
      console.log(`Sending first message with user query and primary file.`);
      const primaryMessage = await openai.beta.threads.messages.create(
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
      );
      threadMessages.push(primaryMessage);

      console.log(`Attaching additional ${fileIds.length - 1} files separately.`);
      const additionalMessages = await Promise.all(
        fileIds.slice(1).map(async (fileId, index) => {
          return openai.beta.threads.messages.create(
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
      'message_creation'
    );
  }
}

/**
 * Process user query with improved file handling and context
 */
async function processUserQuery(params: {
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
  
  try {
    // Update message status
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'preparing_files',
      file_count: files.length
    });

    // Prepare OpenAI files
    const openaiFiles = await prepareFilesForAssistant(files);
    const fileIds = openaiFiles.map(file => file.id);

    // Format file information for the assistant
    const fileInfo = fileContents.map((content, index) => {
      const fileSize = files[index] ? `${(files[index].file_size / 1024).toFixed(1)} KB` : 'Unknown';
      
      const sheetInfo = content.sheets.map(sheet => 
        `    - ${sheet.name}: ${sheet.rowCount} rows × ${sheet.columnCount} columns`
      ).join('\n');
      
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

ADDITIONAL CONTEXT:
This query is part of chat session: ${sessionId}
    `.trim();

    // Update status
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'uploading_files',
      file_count: fileIds.length
    });

    // Attach files to thread
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

    // Create run with specific instructions
    console.log('Creating run with assistant:', assistantId);
    const run = await openai.beta.threads.runs.create(
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

Key points to cover in your response:
- Data structure (columns, types, relationships)
- Key statistics and numerical summaries
- Patterns, trends, or anomalies
- Suggested visualizations or analyses
- Excel-specific features that could be helpful

When generating visualizations:
- Include titles, labels, and legends
- Use appropriate chart types for the data
- Choose color schemes that highlight important information
- Explain what the visualization shows

If code interpreter generates outputs:
- Explain the results in clear, non-technical language
- Reference specific cells, columns, or calculations
- Relate the findings back to the user's original query

Be detailed but concise, and always aim to provide actionable insights.
        `.trim(),
        metadata: { 
          session_id: String(sessionId), 
          message_id: String(messageId), 
          file_count: String(fileIds.length),
          user_id: String(userId)
        }
      },
      { headers: v2Headers }
    );
    
    console.log('Created run:', run.id);

    // Update session with last run ID
    const { error: sessionError } = await supabase
      .from('chat_sessions')
      .update({
        last_run_id: run.id,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId);
      
    if (sessionError) {
      console.error('Error updating session with run ID:', sessionError);
    }
    
    // Update message with run ID
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'analyzing',
      openai_run_id: run.id
    });

    return { threadId, runId: run.id, messageId: primaryMessageId, fileIds };
  } catch (error) {
    console.error('Error in processUserQuery:', error);
    
    if (error instanceof ExcelAssistantError) {
      throw error;
    }
    
    throw new ExcelAssistantError(
      `Failed to process query: ${error.message}`,
      500,
      'query_processing'
    );
  }
}

/**
 * Poll run status with improved handling of different statuses
 */
async function pollRunStatus(params: {
  threadId: string;
  runId: string;
  messageId: string;
}) {
  const { threadId, runId, messageId } = params;
  console.log(`Polling run status for run: ${runId}, message: ${messageId}`);
  
  try {
    let attempts = 0;
    let runStatus = null;
    
    while (attempts < MAX_POLLING_ATTEMPTS) {
      attempts++;
      
      try {
        // Get run status
        const run = await openai.beta.threads.runs.retrieve(
          threadId,
          runId,
          { headers: v2Headers }
        );
        
        console.log(`Run ${runId} status: ${run.status}, attempt: ${attempts}`);
        
        // Update message status based on run status
        const completionPercentage = Math.min(25 + (attempts * 5), 90);
        await updateMessageStatus(messageId, 'processing', '', {
          stage: 'generating',
          completion_percentage: completionPercentage,
          openai_run_id: runId
        });
        
        // Check run status
        if (run.status === 'completed') {
          console.log('Run completed successfully');
          runStatus = 'completed';
          break;
        } else if (['failed', 'cancelled', 'expired'].includes(run.status)) {
          console.error(`Run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
          
          // Add details about the failure for better debugging
          throw new ExcelAssistantError(
            `Run ${run.status}: ${run.last_error?.message || 'Unknown error'}`,
            500,
            `run_${run.status}`
          );
        } else if (run.status === 'requires_action') {
          // Handle tool calls if needed in the future
          console.warn(`Run requires action, currently not supported`);
          throw new ExcelAssistantError(
            'Run requires action, which is not supported in this implementation',
            500,
            'requires_action'
          );
        }
      } catch (pollError) {
        console.error(`Error polling run (attempt ${attempts}):`, pollError);
        
        // If we've reached max attempts, throw the error
        if (attempts >= MAX_POLLING_ATTEMPTS) {
          throw pollError;
        }
        
        // Otherwise, continue polling after a short delay
      }
      
      // Wait before next attempt with exponential backoff
      const delay = Math.min(POLLING_INTERVAL * Math.pow(1.5, attempts - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    if (!runStatus) {
      throw new ExcelAssistantError(
        'Assistant response timed out',
        504,
        'timeout'
      );
    }
    
    return runStatus;
  } catch (error) {
    console.error('Error in pollRunStatus:', error);
    
    if (error instanceof ExcelAssistantError) {
      throw error;
    }
    
    throw new ExcelAssistantError(
      `Failed to poll run status: ${error.message}`,
      500,
      'polling'
    );
  }
}

/**
 * Get assistant response with improved content extraction
 */
async function getAssistantResponse(params: {
  threadId: string;
  messageId: string;
}) {
  const { threadId, messageId } = params;
  console.log('Getting assistant response from thread:', threadId);
  
  try {
    // List messages in thread, sorted by newest first
    const messages = await openai.beta.threads.messages.list(
      threadId,
      { 
        limit: 10, 
        order: 'desc' 
      },
      { headers: v2Headers }
    );
    
    // Find the most recent assistant message
    const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
    
    if (!assistantMessage) {
      throw new ExcelAssistantError(
        'No assistant response found',
        404,
        'response_missing'
      );
    }
    
    console.log('Found assistant message:', assistantMessage.id);
    
    // Extract content from message
    let responseContent = '';
    let hasCodeOutput = false;
    let codeOutputs: Array<{ type: string; file_id: string; description?: string }> = [];
    
    for (const contentPart of assistantMessage.content) {
      if (contentPart.type === 'text') {
        responseContent += contentPart.text.value;
      } else if (contentPart.type === 'image_file') {
        // Enhanced image handling with better descriptions
        hasCodeOutput = true;
        
        // Include a placeholder that will be replaced with actual image in UI
        responseContent += `\n\n[IMAGE: Code Interpreter Visualization - ${contentPart.image_file.file_id}]\n\n`;
        
        codeOutputs.push({
          type: 'image',
          file_id: contentPart.image_file.file_id,
          description: 'Data visualization generated from Excel analysis'
        });
      }
    }
    
    if (!responseContent.trim()) {
      throw new ExcelAssistantError(
        'Empty assistant response',
        500,
        'empty_response'
      );
    }
    
    // Enhanced metadata for better tracking
    const responseMeta = {
      stage: 'completed',
      completion_percentage: 100,
      openai_message_id: assistantMessage.id,
      has_code_output: hasCodeOutput,
      code_outputs: codeOutputs.length ? codeOutputs : undefined,
      completed_at: Date.now(),
      processing_time: Date.now() - (assistantMessage.created_at * 1000)
    };
    
    // Update message with response
    await updateMessageStatus(messageId, 'completed', responseContent, responseMeta);
    
    return {
      content: responseContent,
      messageId: assistantMessage.id,
      metadata: responseMeta
    };
  } catch (error) {
    console.error('Error in getAssistantResponse:', error);
    
    if (error instanceof ExcelAssistantError) {
      throw error;
    }
    
    throw new ExcelAssistantError(
      `Failed to get assistant response: ${error.message}`,
      500,
      'response_retrieval'
    );
  }
}

/**
 * Clean up temporary OpenAI files with retries
 */
async function cleanupOpenAIFiles(fileIds: string[], retryAttempts = 3) {
  if (!fileIds?.length) return;
  
  console.log(`Cleaning up ${fileIds.length} OpenAI files...`);
  
  for (const fileId of fileIds) {
    let attempts = 0;
    let success = false;
    
    while (attempts < retryAttempts && !success) {
      try {
        attempts++;
        await openai.files.del(fileId);
        console.log(`Deleted OpenAI file: ${fileId}`);
        success = true;
      } catch (error) {
        console.error(`Error deleting OpenAI file ${fileId} (attempt ${attempts}):`, error);
        
        // Wait before retry
        if (attempts < retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }
    
    if (!success) {
      console.warn(`Failed to delete OpenAI file: ${fileId} after ${retryAttempts} attempts`);
    }
  }
}

/**
 * Main function handler with improved error management
 */
async function handleExcelAssistant(req: Request): Promise<Response> {
  console.log("Excel assistant function called");
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let messageId = '';
  let tempFileIds: string[] = [];
  
  try {
    // Validate environment variables
    if (!OPENAI_API_KEY) {
      throw new ExcelAssistantError('OPENAI_API_KEY is not set', 500, 'configuration');
    }
    
    // Parse request
    const requestData = await req.json() as RequestData;
    
    // Validate request data
    if (!requestData.fileIds?.length) {
      throw new ExcelAssistantError('No file IDs provided', 400, 'input_validation');
    }
    
    if (!requestData.sessionId || !requestData.messageId) {
      throw new ExcelAssistantError('Session ID and message ID are required', 400, 'input_validation');
    }
    
    const { fileIds, query, userId, sessionId, messageId: msgId, action = 'query' } = requestData;
    messageId = msgId;
    
    console.log('Processing request:', { 
      fileCount: fileIds?.length, 
      action,
      userId: userId?.substring(0, 8) + '...',
      sessionId: sessionId?.substring(0, 8) + '...'
    });

    // Start processing with status update
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'initializing',
      started_at: Date.now(),
      file_count: fileIds.length
    });

    // Get files from database
    const files = await processExcelFiles(fileIds);
    
    // Extract file content for context
    const fileContents = await extractExcelFileContent(files);

    // Get or create thread and assistant
    const { threadId, assistantId } = await getOrCreateThread(sessionId);
    console.log('Using thread:', threadId, 'and assistant:', assistantId);

    // Process query with files
    const { runId, fileIds: openaiFileIds } = await processUserQuery({
      threadId,
      assistantId,
      query,
      files,
      fileContents,
      messageId,
      userId,
      sessionId
    });
    
    // Store file IDs for cleanup
    tempFileIds = openaiFileIds || [];

    // Poll run status
    const runStatus = await pollRunStatus({
      threadId,
      runId,
      messageId
    });

    if (runStatus !== 'completed') {
      throw new ExcelAssistantError(`Run ${runStatus}`, 500, 'run_status');
    }

    // Get assistant response
    const response = await getAssistantResponse({
      threadId,
      messageId
    });

    console.log('Successfully processed assistant response');
    
    // Clean up temporary files asynchronously - don't await to improve response time
    cleanupOpenAIFiles(tempFileIds).catch(err => 
      console.error('Error during file cleanup:', err)
    );

    // Return success response
    return new Response(
      JSON.stringify({ 
        status: 'completed',
        message: response.content,
        metadata: {
          messageId: response.messageId,
          threadId,
          hasCodeOutput: response.metadata.has_code_output,
          processingTime: response.metadata.processing_time
        }
      }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in excel-assistant:', error);
    
    // Clean up temporary files on error
    if (tempFileIds.length > 0) {
      try {
        await cleanupOpenAIFiles(tempFileIds);
      } catch (cleanupError) {
        console.error('Error during file cleanup:', cleanupError);
      }
    }
    
    // Determine error details
    const isExcelAssistantError = error instanceof ExcelAssistantError;
    const errorMessage = error.message || 'An unexpected error occurred';
    const errorStage = isExcelAssistantError ? error.stage : 'unknown';
    const statusCode = isExcelAssistantError ? error.status : 500;
    
    // Format user-friendly error message
    let userErrorMessage = errorMessage;
    if (errorMessage.includes('rate limit')) {
      userErrorMessage = 'OpenAI rate limit exceeded. Please try again later.';
    } else if (errorMessage.includes('context_length_exceeded')) {
      userErrorMessage = 'The files are too large for analysis. Please try with smaller files or fewer files.';
    }
    
    // Update message status to failed if messageId is available
    if (messageId) {
      try {
        await updateMessageStatus(messageId, 'failed', userErrorMessage, {
          error: errorMessage,
          stage: errorStage,
          failed_at: Date.now()
        });
      } catch (statusError) {
        console.error('Error updating failure status:', statusError);
      }
    }

    // Return detailed error response
    return new Response(
      JSON.stringify({ 
        error: userErrorMessage,
        status: 'failed',
        details: {
          stage: errorStage,
          message: errorMessage,
          trace: error.stack || 'No stack trace available'
        }
      }), 
      {
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}

// Serve the handler function
serve(handleExcelAssistant);
