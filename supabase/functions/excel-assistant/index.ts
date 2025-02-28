
import { OpenAI } from "https://esm.sh/openai@4.28.4";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { processExcelContent } from "./excel.ts";
import { Database } from "./database.ts";
import { 
  extractExcelFileNames,
  getMessageText,
  getBaseUrl,
  checkExcelAvailability,
  checkThreadAvailability
} from "./assistant.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const openaiApiKey = Deno.env.get('OPENAI_API_KEY') || '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

const supabase = createClient<Database>(
  supabaseUrl,
  supabaseKey
);

// Main serve function
serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { 
      fileIds,
      query,
      userId,
      sessionId,
      threadId,
      messageId,
      action,
      includeImages = false
    } = await req.json();

    if (!fileIds || fileIds.length === 0) {
      throw new Error('No file IDs provided');
    }

    if (!query && action !== 'continue') {
      throw new Error('No query provided');
    }

    if (!userId) {
      throw new Error('No user ID provided');
    }

    if (!sessionId) {
      throw new Error('No session ID provided');
    }

    if (!messageId) {
      throw new Error('No message ID provided for response tracking');
    }

    console.log(`Processing request for session ${sessionId}, message ${messageId}`);
    console.log(`Files: ${fileIds.join(', ')}`);
    console.log(`Action: ${action}, Query: ${query?.substring(0, 100)}...`);

    // Check if thread exists or create a new one
    const existingThreadId = threadId || await checkThreadAvailability(sessionId);

    // Process the query with OpenAI
    const {
      content: assistantResponse,
      tempFileIds,
      generatedImageIds,
      codeOutputs
    } = await processQuery({
      fileIds,
      query,
      userId,
      sessionId,
      threadId: existingThreadId,
      messageId,
      action,
      includeImages
    });

    // Update the message with the assistant's response
    await updateAssistantMessage(messageId, assistantResponse, codeOutputs, generatedImageIds);

    // Clean up temporary files (but not the generated images)
    await cleanupOpenAIFiles(tempFileIds);
    
    // Store any generated images permanently in the database
    if (generatedImageIds && generatedImageIds.length > 0) {
      await storeGeneratedImages(messageId, generatedImageIds);
    }

    // Return the response
    return new Response(
      JSON.stringify({
        success: true,
        message: "AI response generated successfully",
        content: assistantResponse,
        messageId: messageId,
        threadId: existingThreadId,
        generatedImageIds,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error(`Error in excel-assistant function: ${error.message}`, error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: error.stack,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});

// Process a query using OpenAI API
async function processQuery({ 
  fileIds, 
  query, 
  userId, 
  sessionId, 
  threadId = null,
  messageId,
  action = 'query',
  includeImages = false
}) {
  // Check file availability
  const availableFiles = await checkExcelAvailability(fileIds);
  
  if (availableFiles.length === 0) {
    throw new Error('No available Excel files found for processing');
  }

  console.log(`Processing ${availableFiles.length} Excel files:`, availableFiles);

  // Prepare Excel data
  const openAIFileIds = [];
  const tempFileIds = [];
  
  // Process each Excel file
  for (const fileInfo of availableFiles) {
    try {
      // Create temporary CSV files for OpenAI
      const { fileId: openAIFileId } = await processExcelContent(fileInfo.file_path, fileInfo.filename);
      
      if (openAIFileId) {
        openAIFileIds.push(openAIFileId);
        tempFileIds.push(openAIFileId);
      }
    } catch (error) {
      console.error(`Error processing Excel file ${fileInfo.filename}:`, error);
      throw new Error(`Failed to process Excel file ${fileInfo.filename}: ${error.message}`);
    }
  }

  if (openAIFileIds.length === 0) {
    throw new Error('Failed to process any Excel files');
  }

  console.log(`Processed ${openAIFileIds.length} files for OpenAI`);

  // Get OpenAI response
  const assistantResponse = await getAssistantResponse({
    query,
    openAIFileIds,
    threadId,
    action,
    includeImages
  });

  return {
    content: assistantResponse.content,
    threadId: assistantResponse.threadId,
    tempFileIds,
    generatedImageIds: assistantResponse.generatedImageIds || [],
    codeOutputs: assistantResponse.codeOutputs || []
  };
}

// Get response from OpenAI using given files
async function getAssistantResponse({ 
  query, 
  openAIFileIds, 
  threadId = null,
  action = 'query',
  includeImages = false
}) {
  try {
    const baseMessage = "Process this Excel data and answer the following question. " +
      "Use code to analyze the data when needed. " +
      "If you create any visualizations, make them helpful and clear. " +
      "Be concise but thorough in your response.";

    const promptWithInstructions = `${baseMessage}\n\nQuestion: ${query}`;
    console.log(`Using ${openAIFileIds.length} OpenAI files`);

    // Create a thread if needed
    let thread;
    if (threadId) {
      thread = await openai.beta.threads.retrieve(threadId);
      console.log("Retrieved existing thread:", threadId);
    } else {
      thread = await openai.beta.threads.create();
      console.log("Created new thread:", thread.id);
    }

    // Add the user message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: promptWithInstructions,
      file_ids: openAIFileIds
    });

    // Create a run with the assistant
    const runParams = {
      assistant_id: "asst_GR1OZ3FT4KUH4LfByvlOCvgi", // Excel-specific assistant
      instructions: "You are an Excel data analysis expert. Use the provided Excel files to answer the user's question. Be detailed and show your work when analyzing data. Create visualizations when appropriate. Respond in Markdown format.",
      tools: [{ type: "code_interpreter" }],
    };

    if (includeImages) {
      console.log("Including image generation capabilities");
      runParams.instructions += " Generate images and visualizations whenever it would help explain the data.";
    }

    const run = await openai.beta.threads.runs.create(thread.id, runParams);
    console.log("Created run:", run.id);

    // Poll the run status until it completes
    const runResult = await pollRunStatus(thread.id, run.id);
    console.log(`Run completed with status: ${runResult.status}`);

    if (runResult.status !== 'completed') {
      throw new Error(`Run failed with status: ${runResult.status}`);
    }

    // Get the assistant's messages
    const messages = await openai.beta.threads.messages.list(thread.id, {
      order: "desc",
      limit: 1,
    });

    // Process the messages to extract the response
    const latestMessage = messages.data[0];
    let responseContent = "";
    const codeOutputs = [];
    const generatedImageIds = [];
    let hasCodeOutput = false;

    // Process each content part
    for (const contentPart of latestMessage.content) {
      if (contentPart.type === 'text') {
        responseContent += contentPart.text.value;
      } else if (contentPart.type === 'image_file') {
        hasCodeOutput = true;
        responseContent += `\n\n[Image Generated: Code Interpreter Output]\n\n`;
        
        // Save the image file ID and don't mark it for deletion
        const imageFileId = contentPart.image_file.file_id;
        generatedImageIds.push({
          file_id: imageFileId,
          file_type: 'image'
        });
        
        codeOutputs.push({
          type: 'image',
          file_id: imageFileId
        });
      }
    }

    return {
      content: responseContent,
      threadId: thread.id,
      generatedImageIds,
      codeOutputs,
      hasCodeOutput
    };
  } catch (error) {
    console.error("Error getting assistant response:", error);
    throw new Error(`Failed to get assistant response: ${error.message}`);
  }
}

// Poll the run status until it completes or fails
async function pollRunStatus(threadId, runId, maxAttempts = 60, delayMs = 1000) {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    
    switch (run.status) {
      case 'completed':
        return run;
      case 'failed':
      case 'cancelled':
      case 'expired':
        throw new Error(`Run ${runId} ended with status: ${run.status}`);
      case 'requires_action':
        if (run.required_action?.type === 'submit_tool_outputs') {
          // Handle tool calls if required
          const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
          const toolOutputs = [];
          
          for (const toolCall of toolCalls) {
            // We're not handling specific tool calls now, but this is where you would
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify({ result: "Tool execution completed" })
            });
          }
          
          await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
            tool_outputs: toolOutputs
          });
        }
        break;
      default:
        // For 'in_progress', 'queued', etc.
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw new Error(`Run ${runId} did not complete within the allotted time`);
}

// Update the assistant message with the response content
async function updateAssistantMessage(messageId, content, codeOutputs = [], generatedImages = []) {
  try {
    console.log(`Updating message ${messageId} with response`);
    
    // Build metadata object
    const metadata = {
      processing_stage: {
        stage: 'completed',
        completed_at: Date.now(),
        last_updated: Date.now()
      }
    };
    
    if (codeOutputs && codeOutputs.length > 0) {
      metadata.has_code_output = true;
      metadata.code_outputs = codeOutputs;
    }
    
    if (generatedImages && generatedImages.length > 0) {
      metadata.images = generatedImages;
    }
    
    // Update the message in the database
    const { data, error } = await supabase
      .from('chat_messages')
      .update({
        content: content,
        status: 'completed',
        metadata: metadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', messageId);
    
    if (error) {
      throw error;
    }
    
    console.log(`Successfully updated message ${messageId}`);
    return data;
  } catch (error) {
    console.error(`Error updating assistant message:`, error);
    throw new Error(`Failed to update assistant message: ${error.message}`);
  }
}

// Store references to generated images
async function storeGeneratedImages(messageId, images) {
  if (!images || images.length === 0) {
    console.log("No images to store");
    return { success: true, count: 0 };
  }
  
  try {
    console.log(`Storing ${images.length} generated images for message ${messageId}`);
    
    const imageEntries = images.map(image => ({
      message_id: messageId,
      openai_file_id: image.file_id,
      file_type: image.file_type || 'image',
      created_at: new Date().toISOString()
    }));
    
    const { data, error } = await supabase
      .from('message_generated_images')
      .insert(imageEntries)
      .select();
      
    if (error) {
      console.error('Error storing generated images:', error);
      return { success: false, error, count: 0 };
    }
    
    console.log(`Successfully stored ${data.length} image references`);
    return { success: true, count: data?.length || 0 };
  } catch (error) {
    console.error('Error in storeGeneratedImages:', error);
    return { success: false, error, count: 0 };
  }
}

// Clean up temporary OpenAI files
async function cleanupOpenAIFiles(fileIds) {
  if (!fileIds || fileIds.length === 0) {
    return;
  }

  console.log(`Cleaning up ${fileIds.length} temporary OpenAI files`);
  
  for (const fileId of fileIds) {
    try {
      await openai.files.del(fileId);
      console.log(`Deleted OpenAI file: ${fileId}`);
    } catch (error) {
      console.error(`Error deleting OpenAI file ${fileId}:`, error);
      // Continue with other files even if one fails
    }
  }
}
