import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import OpenAI from "https://esm.sh/openai@4.24.1";

// Constants for configuration
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const MODEL = "gpt-4-1106-preview"; // Using GPT-4 Turbo
const MAX_POLLING_ATTEMPTS = 30;
const POLLING_INTERVAL = 1000; // 1 second

// CORS headers for browser access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize clients
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// Verify OpenAI API key is set
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set in environment variables");
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

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
  console.log('Getting or creating assistant...');
  
  try {
    // List existing assistants
    const assistants = await openai.beta.assistants.list({
      limit: 100,
    });
    
    // Find existing Excel Analysis Assistant
    const existingAssistant = assistants.data.find(
      assistant => assistant.name === "Excel Analysis Assistant"
    );
    
    if (existingAssistant) {
      console.log('Found existing assistant:', existingAssistant.id);
      return existingAssistant;
    }
    
    // Create new assistant if not found
    console.log('Creating new assistant...');
    const newAssistant = await openai.beta.assistants.create({
      name: "Excel Analysis Assistant",
      instructions: 
        "You are a specialized Excel spreadsheet analysis assistant. " +
        "Your primary role is to analyze Excel files, interpret data, explain formulas, " +
        "suggest improvements, and assist with any Excel-related tasks. " +
        "You should provide clear, concise explanations and always aim to make " +
        "complex Excel concepts accessible. When appropriate, suggest formulas, " +
        "techniques, or best practices to improve the user's spreadsheets.",
      model: MODEL,
      tools: [{ type: "retrieval" }]
    });
    
    console.log('Created new assistant:', newAssistant.id);
    return newAssistant;
  } catch (error) {
    console.error('Error in getOrCreateAssistant:', error);
    throw new Error(`Failed to create or get assistant: ${error.message}`);
  }
}

/**
 * Get or create a thread for the session
 */
async function getOrCreateThread(sessionId: string) {
  console.log('Getting or creating thread for session:', sessionId);
  
  try {
    // Check if session already has a thread
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('thread_id, assistant_id')
      .eq('session_id', sessionId)
      .single();
      
    if (sessionError && sessionError.code !== 'PGRST116') {
      console.error('Error fetching session:', sessionError);
      throw sessionError;
    }
    
    // If thread exists, return it
    if (session?.thread_id) {
      console.log('Found existing thread:', session.thread_id);
      
      // Check if thread is valid by attempting to retrieve it
      try {
        await openai.beta.threads.retrieve(session.thread_id);
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
    
    // Create new thread
    console.log('Creating new thread...');
    const newThread = await openai.beta.threads.create();
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
  console.log('Adding message to thread and running assistant');
  
  try {
    // Prepare file descriptions
    const fileDescriptions = fileData.map(file => 
      `${file.filename} (${file.size} bytes)`
    ).join('\n- ');
    
    // Prepare message content with file context
    const messageContent = `
User Query: ${query}

Available Excel Files:
- ${fileDescriptions}

Please analyze these Excel files and answer the query.
    `.trim();
    
    // Add message to thread
    console.log('Adding message to thread:', threadId);
    const threadMessage = await openai.beta.threads.messages.create(
      threadId,
      {
        role: "user",
        content: messageContent
      }
    );
    console.log('Added message to thread, message ID:', threadMessage.id);
    
    // Update database with thread message ID
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'processing',
      thread_message_id: threadMessage.id
    });
    
    // Create a run
    console.log('Creating run with assistant:', assistantId);
    const run = await openai.beta.threads.runs.create(
      threadId,
      {
        assistant_id: assistantId,
        instructions: `
Analyze the Excel files mentioned in the user query.
Focus on providing clear, accurate information about the spreadsheet data.
If formulas are mentioned, explain them in detail.
If data analysis is requested, provide thorough insights.
Always be helpful and provide actionable suggestions when appropriate.
        `.trim()
      }
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
    
    return {
      threadId,
      runId: run.id,
      messageId: threadMessage.id
    };
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
          runId
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
  console.log('Getting assistant response from thread:', threadId);
  
  try {
    // List messages in thread, sorted by newest first
    const messages = await openai.beta.threads.messages.list(
      threadId,
      { limit: 10, order: 'desc' }
    );
    
    // Find the most recent assistant message
    const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
    
    if (!assistantMessage) {
      throw new Error('No assistant response found');
    }
    
    console.log('Found assistant message:', assistantMessage.id);
    
    // Extract content from message
    let responseContent = '';
    for (const contentPart of assistantMessage.content) {
      if (contentPart.type === 'text') {
        responseContent += contentPart.text.value;
      }
    }
    
    if (!responseContent.trim()) {
      throw new Error('Empty assistant response');
    }
    
    // Update message with response
    await updateMessageStatus(messageId, 'completed', responseContent, {
      stage: 'completed',
      completion_percentage: 100,
      openai_message_id: assistantMessage.id
    });
    
    return {
      content: responseContent,
      messageId: assistantMessage.id
    };
  } catch (error) {
    console.error('Error in getAssistantResponse:', error);
    throw new Error(`Failed to get assistant response: ${error.message}`);
  }
}

/**
 * Main request handler
 */
serve(async (req) => {
  console.log("Excel assistant function called");
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let messageId = '';
  
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

    // Get or create thread
    const { threadId, assistantId } = await getOrCreateThread(sessionId);
    console.log('Using thread:', threadId, 'and assistant:', assistantId);

    // Add message to thread and run assistant
    const { runId } = await addMessageAndRun({
      threadId,
      assistantId,
      query,
      fileData,
      messageId,
      userId
    });

    // Poll run status
    const runStatus = await pollRunStatus({
      threadId,
      runId,
      messageId
    });

    if (runStatus !== 'completed') {
      throw new Error(`Run ${runStatus}`);
    }

    // Get assistant response
    const response = await getAssistantResponse({
      threadId,
      messageId
    });

    console.log('Successfully processed assistant response');

    // Return success response
    return new Response(JSON.stringify({ 
      status: 'completed',
      message: response.content
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in excel-assistant:', error);
    
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
