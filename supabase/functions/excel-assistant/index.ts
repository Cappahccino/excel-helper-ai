import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import OpenAI from "https://esm.sh/openai@4.20.1";

// Constants for configuration
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const MODEL = "gpt-4-turbo";
const MAX_POLLING_ATTEMPTS = 30;
const POLLING_INTERVAL = 1000; // 1 second

// CORS headers for browser access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// Verify OpenAI API key is set
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set in environment variables");
}

// Initialize OpenAI with v2 beta header
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  defaultHeaders: {
    "OpenAI-Beta": "assistants=v2"
  },
  dangerouslyAllowBrowser: true
});

// Ensure v2 headers are present for all API calls
const v2Headers = {
  "OpenAI-Beta": "assistants=v2"
};

/**
 * Update message status in database
 */
async function updateMessageStatus(
  messageId: string, 
  status: string, 
  content: string = '', 
  metadata: any = {}
) {
  console.log(`Updating message ${messageId} to status: ${status}`);
  
  try {
    const updateData: any = {
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
      throw error;
    }
  } catch (error) {
    console.error('Error in updateMessageStatus:', error);
    // Don't throw here to prevent cascading failures
  }
}

/**
 * Get or create an OpenAI Assistant for Excel analysis
 */
async function getOrCreateAssistant() {
  console.log('Getting or creating assistant with v2 API...');
  
  try {
    // List existing assistants with v2 header
    const assistants = await openai.beta.assistants.list({
      limit: 100,
    }, {
      headers: v2Headers
    });
    
    // Find existing Excel Analysis Assistant
    const existingAssistant = assistants.data.find(
      assistant => assistant.name === "Excel Analysis Assistant"
    );
    
    if (existingAssistant) {
      console.log('Found existing assistant:', existingAssistant.id);
      // Retrieve with v2 header to ensure compatibility
      return await openai.beta.assistants.retrieve(existingAssistant.id, {
        headers: v2Headers
      });
    }
    
    // Create new assistant if not found with v2 header
    console.log('Creating new assistant with v2 API...');
    const newAssistant = await openai.beta.assistants.create({
      name: "Excel Analysis Assistant",
      instructions: 
        "You are a specialized Excel spreadsheet analysis assistant. " +
        "Your primary role is to analyze Excel files, interpret data, explain formulas, " +
        "suggest improvements, and assist with any Excel-related tasks. " +
        "When appropriate, use the code interpreter to perform calculations, generate " +
        "visualizations, or process data from the Excel files. " +
        "Always aim to be clear, concise, and helpful. Make complex Excel concepts " +
        "accessible and suggest formulas, techniques, or best practices to improve " +
        "the user's spreadsheets.",
      model: MODEL,
      tools: [
        { type: "retrieval" },
        { type: "code_interpreter" }
      ]
    }, {
      headers: v2Headers
    });
    
    console.log('Created new assistant:', newAssistant.id);
    return newAssistant;
  } catch (error) {
    console.error('Error in getOrCreateAssistant:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw new Error(`Failed to create or get assistant: ${error.message}`);
  }
}

/**
 * Get or create a thread for the session
 */
async function getOrCreateThread(sessionId: string) {
  console.log('Getting or creating thread for session with v2 API:', sessionId);
  
  try {
    // Check if session already has a thread
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('thread_id, assistant_id')
      .eq('session_id', sessionId)
      .maybeSingle();
      
    if (sessionError && sessionError.code !== 'PGRST116') {
      console.error('Error fetching session:', sessionError);
      throw sessionError;
    }
    
    // If thread exists, return it
    if (session?.thread_id) {
      console.log('Found existing thread:', session.thread_id);
      
      // Check if thread is valid by attempting to retrieve it with v2 header
      try {
        await openai.beta.threads.retrieve(session.thread_id, {
          headers: v2Headers
        });
        return {
          threadId: session.thread_id,
          assistantId: session.assistant_id,
          isNew: false
        };
      } catch (threadError) {
        console.warn('Existing thread not found on OpenAI, creating new one:', threadError.message);
        // Continue to create a new thread
      }
    }
    
    // Create new thread with v2 header
    console.log('Creating new thread with v2 API...');
    const newThread = await openai.beta.threads.create({}, {
      headers: v2Headers
    });
    console.log('Created new thread:', newThread.id);
    
    // Get or create assistant
    const assistant = await getOrCreateAssistant();
    
    // Update session with thread and assistant IDs
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({
        thread_id: newThread.id,
        assistant_id: assistant.id,
        openai_model: MODEL
      })
      .eq('session_id', sessionId);
      
    if (updateError) {
      console.error('Error updating session with thread ID:', updateError);
      throw updateError;
    }
    
    return {
      threadId: newThread.id,
      assistantId: assistant.id,
      isNew: true
    };
  } catch (error) {
    console.error('Error in getOrCreateThread:', error);
    throw new Error(`Thread creation failed: ${error.message}`);
  }
}

/**
 * Process Excel data and prepare file metadata
 */
async function processExcelData(fileIds: string[]) {
  console.log('Processing Excel files:', fileIds);
  
  try {
    if (!fileIds || !fileIds.length) {
      throw new Error('No file IDs provided');
    }
    
    const { data: files, error } = await supabase
      .from('excel_files')
      .select('*')
      .in('id', fileIds);

    if (error) {
      console.error('Error fetching Excel files:', error);
      throw error;
    }
    
    if (!files?.length) {
      throw new Error('No files found with the provided IDs');
    }
    
    console.log(`Found ${files.length} files:`, files.map(f => f.filename).join(', '));

    // Return processed file data
    return files.map(file => ({
      id: file.id,
      filename: file.filename,
      status: file.processing_status,
      size: file.file_size,
      path: file.file_path,
      created_at: file.created_at,
      user_id: file.user_id
    }));
  } catch (error) {
    console.error('Error in processExcelData:', error);
    throw new Error(`Failed to process Excel data: ${error.message}`);
  }
}

/**
 * Download and prepare files for the assistant
 */
async function prepareFilesForAssistant(fileData: any[]) {
  try {
    console.log('Preparing files for assistant...');
    
    // For each file, download from Supabase storage and upload to OpenAI
    const openaiFiles = [];
    
    for (const file of fileData) {
      try {
        // Download file from Supabase storage
        console.log(`Downloading file from storage: ${file.filename}`);
        const { data: fileContent, error: downloadError } = await supabase.storage
          .from('excel_files')
          .download(file.path);
        
        if (downloadError || !fileContent) {
          console.error(`Error downloading file ${file.filename}:`, downloadError);
          continue;
        }
        
        // Convert to Blob with appropriate MIME type based on file extension
        let mimeType = 'application/octet-stream';
        if (file.filename.endsWith('.xlsx')) {
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else if (file.filename.endsWith('.xls')) {
          mimeType = 'application/vnd.ms-excel';
        } else if (file.filename.endsWith('.csv')) {
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
    throw new Error(`Failed to prepare files for assistant: ${error.message}`);
  }
}

/**
 * Attach files to a thread in OpenAI Assistants API v2
 * - If only 1 file is uploaded, send a single request
 * - If multiple files, send multiple `messages.create()` requests
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

    // Convert all metadata values to strings
    const stringifyMetadata = (metadataObj: Record<string, any>): Record<string, string> => {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(metadataObj)) {
        result[key] = String(value); // Convert every value to a string
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
            total_files: fileIds.length,
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
                file_index: String(index + 1),  // ✅ Convert number to string
                total_files: String(fileIds.length),  // ✅ Convert number to string
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
    throw error;
  }
}


/**
 * Add user message to thread and run assistant
 */
async function addMessageAndRun(params: {
  threadId: string;
  assistantId: string;
  query: string;
  fileData: any[];
  messageId: string;
  userId: string;
}) {
  const { threadId, assistantId, query, fileData, messageId, userId } = params;
  console.log('Adding message to thread and running assistant with v2 API');

  try {
    // Prepare OpenAI files
    const openaiFiles = await prepareFilesForAssistant(fileData);
    const fileIds = openaiFiles.map(file => file.id);

    // Prepare file descriptions
    const fileDescriptions = fileData.map(file => 
      `${file.filename} (${file.size} bytes)`
    ).join('\n- ');

    // Prepare message content with file context
    const messageContentText = `
User Query: ${query}

Available Excel Files:
- ${fileDescriptions}

Please analyze these Excel files and answer the query. When appropriate, use code interpreter to analyze the data or create visualizations.
    `.trim();

    // Update database with processing status
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
      metadata: { query, file_count: fileIds.length }
    });

    // Update database with thread message ID
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'processing',
      thread_message_id: primaryMessageId,
      file_count: fileIds.length,
      is_multi_file: fileIds.length > 1,
      multi_file_message_ids: fileIds.length > 1 ? messages.map(m => m.id) : undefined
    });

    // Create a run with v2 format
    console.log('Creating run with assistant:', assistantId);
    const run = await openai.beta.threads.runs.create(
      threadId,
      {
        assistant_id: assistantId,
        instructions: `
Analyze the Excel files mentioned in the user query.
Focus on providing clear, accurate information about the spreadsheet data.
Use code interpreter when it would help with:
  - Complex calculations
  - Data visualization
  - Statistical analysis
  - Summarizing large datasets
If formulas are mentioned, explain them in detail.
If data analysis is requested, provide thorough insights.
If an image is generated using the code interpreter, provide a detailed description of the image in plain language.
Instead of saying '[Image Generated]', explain:
  - What the image represents.
  - What insights it provides.
  - Key observations from the chart or visualization.
Always be helpful and provide actionable suggestions when appropriate.
        `.trim(),
        metadata: { 
          session_id: String(params.userId), 
          message_id: String(messageId), 
          file_count: String(fileIds.length) 
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
      .eq('thread_id', threadId);
      
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
    console.error('Error in addMessageAndRun:', error);
    throw new Error(`Failed to add message and run: ${error.message}`);
  }
}

/**
 * Poll run status until completed or failed
 */
async function pollRunStatus(params: {
  threadId: string;
  runId: string;
  messageId: string;
}) {
  const { threadId, runId, messageId } = params;
  console.log(`Polling run status with v2 API for run: ${runId}, message: ${messageId}`);
  
  try {
    let attempts = 0;
    let runStatus = null;
    
    while (attempts < MAX_POLLING_ATTEMPTS) {
      attempts++;
      
      try {
        // Get run status with v2 format and explicit v2 header
        const run = await openai.beta.threads.runs.retrieve(
          threadId,
          runId,
          {
            headers: v2Headers
          }
        );
        
        console.log(`Run ${runId} status: ${run.status}, attempt: ${attempts}`);
        
        // Update message status based on run status
        let completionPercentage = Math.min(25 + (attempts * 5), 90);
        await updateMessageStatus(messageId, 'processing', '', {
          stage: 'generating',
          completion_percentage: completionPercentage,
          openai_run_id: runId
        });
        
        // Check if run is completed or failed
        if (run.status === 'completed') {
          console.log('Run completed successfully');
          runStatus = 'completed';
          break;
        } else if (['failed', 'cancelled', 'expired'].includes(run.status)) {
          console.error(`Run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
          runStatus = run.status;
          break;
        } else if (run.status === 'requires_action') {
          // This shouldn't happen with current tools but handle just in case
          console.warn(`Run requires action, not supported in this implementation`);
          runStatus = 'failed';
          break;
        }
      } catch (pollError) {
        console.error(`Error polling run (attempt ${attempts}):`, pollError);
        
        // If we've reached max attempts, throw the error
        if (attempts >= MAX_POLLING_ATTEMPTS) {
          throw pollError;
        }
        
        // Otherwise, continue polling
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }
    
    if (!runStatus) {
      console.error('Run polling timed out');
      throw new Error('Assistant response timed out');
    }
    
    return runStatus;
  } catch (error) {
    console.error('Error in pollRunStatus:', error);
    throw new Error(`Failed to poll run status: ${error.message}`);
  }
}

/**
 * Get assistant response from thread
 */
async function getAssistantResponse(params: {
  threadId: string;
  messageId: string;
}) {
  const { threadId, messageId } = params;
  console.log('Getting assistant response from thread with v2 API:', threadId);
  
  try {
    // List messages in thread, sorted by newest first with explicit v2 header
    const messages = await openai.beta.threads.messages.list(
      threadId,
      { 
        limit: 10, 
        order: 'desc' 
      },
      {
        headers: v2Headers
      }
    );
    
    // Find the most recent assistant message
    const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
    
    if (!assistantMessage) {
      throw new Error('No assistant response found');
    }
    
    console.log('Found assistant message:', assistantMessage.id);
    
    // Extract content from message (with v2 format)
    let responseContent = '';
    let hasCodeOutput = false;
    let codeOutputs = [];
    let imageFileIds: string[] = [];


    for (const contentPart of assistantMessage.content) {
      if (contentPart.type === "text") {
        responseContent += contentPart.text.value + "\n\n";
      } else if (contentPart.type === "image_file") {
        imageFileIds.push(contentPart.image_file.file_id);
      }
    }

    // ✅ Store generated image file IDs in `message_generated_images`
    if (imageFileIds.length > 0) {
      const imageData = imageFileIds.map(fileId => ({
        message_id: messageId,
        openai_file_id: fileId,
        file_type: "image",
        created_at: new Date().toISOString(),
        metadata: JSON.stringify({ source: "OpenAI Code Interpreter" }),
        deleted_at: null,  // Ensures soft deletion support
      }));

    const { error } = await supabase.from("message_generated_images").insert(imageData);

      if (error) {
        console.error("Error saving image file IDs:", error);
      } else {
        console.log("✅ Image file IDs saved in message_generated_images:", imageFileIds);
      }
    }
    
    if (!responseContent.trim()) {
      throw new Error('Empty assistant response');
    }
    
     // ✅ Update `chat_messages` with response details
    await supabase
      .from("chat_messages")
      .update({
        status: "completed",
        content: responseContent,
        metadata: {
          openai_message_id: assistantMessage.id,
          has_code_output: imageFileIds.length > 0,
          image_file_ids: imageFileIds.length ? imageFileIds : undefined,
        }
      })
      .eq("id", messageId);

    return { content: responseContent, imageFileIds, messageId: assistantMessage.id };
  } catch (error) {
    console.error("Error in getAssistantResponse:", error);
    throw new Error(`Failed to get assistant response: ${error.message}`);
  }
}

/**
 * Clean up temporary OpenAI files
 */
async function cleanupOpenAIFiles(fileIds: string[]) {
  if (!fileIds?.length) return;
  
  console.log(`Cleaning up ${fileIds.length} OpenAI files...`);
  
  for (const fileId of fileIds) {
    try {
      // Delete file from OpenAI
      await openai.files.del(fileId);
      console.log(`Deleted OpenAI file: ${fileId}`);
    } catch (error) {
      console.error(`Error deleting OpenAI file ${fileId}:`, error);
      // Continue with other files
    }
  }
}

/**
 * Main request handler
 */
serve(async (req) => {
  console.log("Excel assistant function called with Assistants API v2");
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let messageId = '';
  let tempFileIds: string[] = [];
  
  try {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    
    // Parse request
    const requestData = await req.json();
    console.log('Request data received:', Object.keys(requestData));
    
    const { fileIds, query, userId, sessionId, messageId: msgId, action = 'query' } = requestData;
    messageId = msgId;
    
    console.log('Processing request:', { 
      fileCount: fileIds?.length, 
      messageId, 
      action, 
      sessionId: sessionId?.substring(0, 8) + '...'
    });

    if (!sessionId || !messageId) {
      throw new Error('Session ID and message ID are required');
    }

    // Update initial message status
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'initializing',
      started_at: Date.now()
    });

    // Process Excel files
    const fileData = await processExcelData(fileIds);
    console.log('Processed files:', fileData.map(f => f.filename));

    // Get or create thread with v2 API
    const { threadId, assistantId } = await getOrCreateThread(sessionId);
    console.log('Using thread:', threadId, 'and assistant:', assistantId);

    // Add message to thread and run assistant with v2 API
    const { runId, fileIds: openaiFileIds } = await addMessageAndRun({
      threadId,
      assistantId,
      query,
      fileData,
      messageId,
      userId
    });
    
    // Store file IDs for cleanup
    tempFileIds = openaiFileIds || [];

    // Poll run status with v2 API
    const runStatus = await pollRunStatus({
      threadId,
      runId,
      messageId
    });

    if (runStatus !== 'completed') {
      throw new Error(`Run ${runStatus}`);
    }

    // Get assistant response with v2 API
    const response = await getAssistantResponse({
      threadId,
      messageId
    });

    console.log('Successfully processed assistant response');
    
    // Clean up temporary files
    await cleanupOpenAIFiles(tempFileIds);

    // Return success response
    return new Response(JSON.stringify({ 
      status: 'completed',
      message: response.content
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in excel-assistant:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    
    // Clean up temporary files on error
    if (tempFileIds.length > 0) {
      try {
        await cleanupOpenAIFiles(tempFileIds);
      } catch (cleanupError) {
        console.error('Error during file cleanup:', cleanupError);
      }
    }
    
    // Update message status to failed if messageId is available
    if (messageId) {
      try {
        const errorMessage = error.message || 'An unexpected error occurred';
        const statusMessage = errorMessage.includes('rate limit') 
          ? 'OpenAI rate limit exceeded. Please try again later.'
          : errorMessage;
          
        await updateMessageStatus(messageId, 'failed', statusMessage, {
          error: errorMessage,
          failed_at: Date.now()
        });
      } catch (statusError) {
        console.error('Error updating failure status:', statusError);
      }
    }

    // Return error response
    return new Response(JSON.stringify({ 
      error: error.message || 'An unexpected error occurred',
      trace: error.stack || 'No stack trace available'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
