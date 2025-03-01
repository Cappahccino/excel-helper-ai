import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import OpenAI from "https://esm.sh/openai@4.24.1";
import { getFileExtension, getMimeTypeFromExtension } from "./excel.ts";
import { corsHeaders } from "./cors.ts";
import { OPENAI_CONFIG, SUPABASE_CONFIG } from "./config.ts";

// Initialize Supabase client
const supabase = createClient(
  SUPABASE_CONFIG.URL,
  SUPABASE_CONFIG.ANON_KEY,
  {
    global: {
      headers: { Authorization: `Bearer ${SUPABASE_CONFIG.SERVICE_ROLE_KEY}` },
    },
  }
);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_CONFIG.OPENAI_API_KEY,
});

/**
 * Log chat messages to Supabase
 */
async function logChatMessage(
  supabase: any,
  message: any
) {
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert([message])
      .select();

    if (error) {
      console.error("Error logging chat message:", error);
      throw new Error(`Failed to log chat message: ${error.message}`);
    }

    console.log("Chat message logged successfully:", data);
    return data;
  } catch (error) {
    console.error("Error in logChatMessage:", error);
    throw error;
  }
}

/**
 * Update chat message status in Supabase
 */
async function updateChatMessageStatus(
  supabase: any,
  messageId: string,
  status: string,
  content?: string,
  metadata?: any
) {
  try {
    const updateData: any = {
      status: status,
      updated_at: new Date().toISOString(),
    };

    if (content) {
      updateData.content = content;
    }

    if (metadata) {
      updateData.metadata = metadata;
    }

    const { data, error } = await supabase
      .from("chat_messages")
      .update(updateData)
      .eq("id", messageId)
      .select();

    if (error) {
      console.error(`Error updating chat message ${messageId}:`, error);
      throw new Error(`Failed to update chat message: ${error.message}`);
    }

    console.log(`Chat message ${messageId} updated successfully:`, data);
    return data;
  } catch (error) {
    console.error(`Error in updateChatMessageStatus for message ${messageId}:`, error);
    throw error;
  }
}

/**
 * Fetch and prepare files for the assistant
 */
async function prepareFilesForAssistant(supabase, fileIds, openai) {
  try {
    // Fetch file details from the database
    const { data: files, error } = await supabase
      .from("excel_files")
      .select("*")
      .in("id", fileIds);

    if (error) {
      console.error("Error fetching file details:", error);
      throw new Error(`Failed to fetch file details: ${error.message}`);
    }

    if (!files?.length) {
      throw new Error(`No files found with IDs: ${fileIds.join(", ")}`);
    }

    const openaiFiles = [];
    
    for (const file of files) {
      try {
        // Download file from storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("excel-files")
          .download(file.storage_path);

        if (downloadError) {
          console.error(`Error downloading file ${file.id}:`, downloadError);
          throw new Error(`Failed to download file: ${downloadError.message}`);
        }

        // Get file extension and MIME type
        const extension = getFileExtension(file.filename);
        const mimeType = getMimeTypeFromExtension(extension);

        // Convert to Blob with appropriate MIME type
        const blob = new Blob([fileData], { type: mimeType });

        // Create file in OpenAI
        const oaiFile = await openai.files.create({
          file: blob,
          purpose: "assistants",
        });

        console.log(`Uploaded file ${file.id} to OpenAI as ${oaiFile.id}`);
        
        openaiFiles.push({
          file_id: oaiFile.id, 
          openai_file_id: oaiFile.id,
          filename: file.filename,
          mime_type: mimeType
        });
      } catch (error) {
        console.error(`Error processing file ${file.id}:`, error);
        // Continue with other files even if one fails
      }
    }

    return openaiFiles;
  } catch (error) {
    console.error("Error in prepareFilesForAssistant:", error);
    throw error;
  }
}

/**
 * Create a thread and run for the assistant
 */
async function createThreadAndRun(
  openai: any,
  assistantId: string,
  query: string,
  fileIds: string[],
  userId: string,
  sessionId: string,
  messageId: string,
  includeImages: boolean = true
) {
  try {
    // Create a thread
    const thread = await openai.beta.threads.create({
      metadata: {
        user_id: userId,
        session_id: sessionId,
        message_id: messageId,
      },
    });

    // Add message to thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: query,
    });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
      // instructions: OPENAI_CONFIG.SYSTEM_PROMPT,
      tools: OPENAI_CONFIG.TOOLS,
      metadata: {
        user_id: userId,
        session_id: sessionId,
        message_id: messageId,
      },
    });

    console.log(`Thread ${thread.id} and run ${run.id} created successfully`);
    return { threadId: thread.id, runId: run.id };
  } catch (error) {
    console.error("Error in createThreadAndRun:", error);
    throw error;
  }
}

/**
 * Process the response from the assistant
 */
async function processAssistantResponse(
  openai: any,
  threadId: string,
  runId: string,
  messageId: string,
  includeImages: boolean = true
) {
  try {
    // Retrieve the run
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);

    if (run.status === "completed") {
      // Get the messages
      const messages = await openai.beta.threads.messages.list(threadId);
      const messageContent = messages.data[0].content;

      // Extract the text value
      const textValue = messageContent[0].text.value;

      // Extract the file IDs
      const annotations = messageContent[0].text.annotations;
      const fileIds = annotations
        .filter((annotation: any) => annotation.type === "file_path")
        .map((annotation: any) => annotation.file_path.file_id);

      // Get the images
      const images = annotations
        .filter((annotation: any) => annotation.type === "image_file")
        .map((annotation: any) => ({ file_id: annotation.image_file.file_id, file_type: 'image' }));

      console.log(`Assistant response: ${textValue}`);
      console.log(`File IDs: ${JSON.stringify(fileIds)}`);
      console.log(`Image Files: ${JSON.stringify(images)}`);

      return { content: textValue, fileIds: fileIds, images: images };
    } else {
      console.warn(`Run status: ${run.status}`);
      return null;
    }
  } catch (error) {
    console.error("Error in processAssistantResponse:", error);
    throw error;
  }
}

/**
 * Main function to handle requests
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Parse the request body
    const { fileIds, query, userId, sessionId, threadId, messageId, action, includeImages } =
      await req.json();

    // Check if required parameters are missing
    if (!fileIds || !query || !userId || !sessionId || !messageId) {
      console.error("Missing required parameters");
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Log the chat message
    const message = {
      id: messageId,
      session_id: sessionId,
      user_id: userId,
      content: query,
      role: "user",
      is_ai_response: false,
      excel_files: fileIds.map((fileId: string) => ({ id: fileId })),
      status: "processing",
      created_at: new Date().toISOString(),
    };
    await logChatMessage(supabase, message);

    // Prepare files for the assistant
    const openaiFiles = await prepareFilesForAssistant(supabase, fileIds, openai);
    const oaiFileIds = openaiFiles.map((file: any) => file.file_id);

    // Create a thread and run
    const { threadId: newThreadId, runId } = await createThreadAndRun(
      openai,
      OPENAI_CONFIG.ASSISTANT_ID,
      query,
      oaiFileIds,
      userId,
      sessionId,
      messageId,
      includeImages
    );

    // Wait for the assistant to process the request
    let assistantResponse = null;
    let attempts = 0;
    const maxAttempts = 60; // Maximum number of attempts
    const delay = 1000; // Delay between attempts in milliseconds

    while (!assistantResponse && attempts < maxAttempts) {
      // Wait for the specified delay
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Process the assistant response
      assistantResponse = await processAssistantResponse(
        openai,
        newThreadId,
        runId,
        messageId,
        includeImages
      );

      // Increment the attempts
      attempts++;
    }

    // Check if the assistant response is null
    if (!assistantResponse) {
      console.error("Assistant response is null");
      await updateChatMessageStatus(
        supabase,
        messageId,
        "failed",
        "Assistant failed to respond in a timely manner."
      );
      return new Response(
        JSON.stringify({
          error: "Assistant failed to respond in a timely manner.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update the chat message status
    await updateChatMessageStatus(
      supabase,
      messageId,
      "completed",
      assistantResponse.content
    );

    // Log the assistant message
    const assistantMessage = {
      id: messageId + "-assistant",
      session_id: sessionId,
      user_id: "assistant",
      content: assistantResponse.content,
      role: "assistant",
      is_ai_response: true,
      excel_files: fileIds.map((fileId: string) => ({ id: fileId })),
      status: "completed",
      created_at: new Date().toISOString(),
    };
    await logChatMessage(supabase, assistantMessage);

    // Return the assistant response
    return new Response(
      JSON.stringify({
        content: assistantResponse.content,
        fileIds: assistantResponse.fileIds,
        images: assistantResponse.images
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in main function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
