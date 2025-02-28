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
 * Clean up temporary OpenAI files (Only Excel file IDs, NOT Image IDs)
 */
async function cleanupOpenAIFiles(fileIds: string[], imageFileIds: string[]) {
  if (!fileIds?.length) return;

  // Exclude image file IDs from cleanup
  const excelFileIds = fileIds.filter(id => !imageFileIds.includes(id));

  console.log(`Cleaning up ${excelFileIds.length} OpenAI files...`);

  for (const fileId of excelFileIds) {
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
 * Get assistant response from thread and store image file IDs
 */
async function getAssistantResponse({ threadId, messageId }) {
  console.log('Getting assistant response from thread:', threadId);

  try {
    const messages = await openai.beta.threads.messages.list(
      threadId,
      { limit: 10, order: "desc" },
      { headers: v2Headers }
    );

    const assistantMessage = messages.data.find(msg => msg.role === "assistant");
    if (!assistantMessage) {
      throw new Error("No assistant response found");
    }

    console.log("Found assistant message:", assistantMessage.id);

    let responseContent = "";
    let imageFileIds = [];

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
      throw new Error("Empty assistant response");
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
  let imageFileIds: string[] = [];

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

    // Get or create thread with v2 API
    const { threadId, assistantId } = await getOrCreateThread(sessionId);
    console.log('Using thread:', threadId, 'and assistant:', assistantId);

    // Add message to thread and run assistant with v2 API
    const { runId, fileIds: openaiFileIds } = await addMessageAndRun({
      threadId,
      assistantId,
      query,
      fileData: await processExcelData(fileIds),
      messageId,
      userId
    });

    // Store file IDs for cleanup
    tempFileIds = openaiFileIds || [];

    // Poll run status with v2 API
    const runStatus = await pollRunStatus({ threadId, runId, messageId });

    if (runStatus !== 'completed') {
      throw new Error(`Run ${runStatus}`);
    }

    // Get assistant response with v2 API
    const response = await getAssistantResponse({ threadId, messageId });

    console.log('Successfully processed assistant response');
    imageFileIds = response.imageFileIds;

    // Clean up only Excel file IDs (NOT image file IDs)
    await cleanupOpenAIFiles(tempFileIds, imageFileIds);

    // Return success response
    return new Response(JSON.stringify({
      status: 'completed',
      message: response.content
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in excel-assistant:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
