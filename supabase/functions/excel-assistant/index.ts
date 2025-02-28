import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'https://cdn.jsdelivr.net/npm/openai@4.17.4/+esm'

const apiKey = Deno.env.get('OPENAI_API_KEY')
const openai = new OpenAI({ apiKey })

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const supabaseAdmin = createClient(supabaseUrl!, supabaseKey!)

const assistantId = Deno.env.get('OPENAI_ASSISTANT_ID')

const v2Headers = {
  'OpenAI-Beta': 'assistants=v1',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { fileIds, query, userId, sessionId, threadId, messageId, action } = await req.json()

    if (!fileIds || !query || !userId || !sessionId || !messageId) {
      console.error('Missing required parameters')
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    if (action === 'query') {
      // 1. Create/Get thread
      let currentThreadId = threadId
      if (!currentThreadId) {
        const thread = await openai.beta.threads.create()
        currentThreadId = thread.id
        console.log('Created new thread:', currentThreadId)

        // Also store in DB
        const { error } = await supabaseAdmin
          .from('chat_sessions')
          .update({ thread_id: currentThreadId })
          .eq('session_id', sessionId)

        if (error) {
          console.error('Error updating session with thread ID:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to update session with thread ID' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }

      // 2. Attach files to thread
      const { messages, primaryMessageId } = await attachFilesToThread({
        threadId: currentThreadId,
        messageContent: query,
        fileIds,
        userId,
        metadata: {
          session_id: sessionId,
          message_id: messageId,
        },
      })

      // 3. Create run and wait for completion
      const { content, openai_message_id } = await createThreadRunAndWait({
        sessionId,
        userId,
        messageId,
        metadata: {
          primary_message_id: primaryMessageId,
        },
      })

      return new Response(
        JSON.stringify({ data: content, openai_message_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else if (action === 'feedback') {
      // TODO: Implement feedback
      return new Response(
        JSON.stringify({ data: 'Feedback received' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      console.warn('Unknown action:', action)
      return new Response(
        JSON.stringify({ error: 'Unknown action' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  } catch (error) {
    console.error('Error processing request:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function updateMessageStatus(
  messageId: string,
  status: string,
  content: string = '',
  metadata: Record<string, any> = {}
) {
  try {
    console.log(`Updating message ${messageId} to status: ${status}`)

    const { error } = await supabaseAdmin
      .from('chat_messages')
      .update({
        status: status,
        content: content,
        processing_stage: metadata,
        metadata: metadata,
      })
      .eq('id', messageId)

    if (error) {
      console.error('Error updating message status:', error)
      throw error
    }
  } catch (error) {
    console.error('Error in updateMessageStatus:', error)
    throw error
  }
}

// Helper to stringify all metadata values
function stringifyMetadata(metadata: Record<string, any>): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) {
      continue;
    }
    result[key] = String(value);
  }
  
  return result;
}

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

    const threadMessages = [];
    const stringifiedMetadata = stringifyMetadata(metadata);

    if (fileIds.length === 1) {
      console.log(`Attaching single file (${fileIds[0]}) to message.`);
      const message = await openai.beta.threads.messages.create(
        threadId,
        {
          role: "user",
          content: [{ type: "text", text: messageContent }],
          attachments: [{ file_id: fileIds[0], tools: [{ type: "code_interpreter" }] }],
          metadata: {
            user_id: userId.toString(),
            message_type: "excel_query",
            is_multi_file: "false",
            ...stringifiedMetadata
          }
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
          attachments: [{ file_id: fileIds[0], tools: [{ type: "code_interpreter" }] }],
          metadata: {
            user_id: userId.toString(),
            message_type: "excel_query",
            is_multi_file: "true",
            file_index: "0",
            total_files: fileIds.length.toString(),
            ...stringifiedMetadata
          }
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
              attachments: [{ file_id: fileId, tools: [{ type: "code_interpreter" }] }],
              metadata: {
                user_id: userId.toString(),
                message_type: "excel_additional_file",
                is_multi_file: "true",
                file_index: (index + 1).toString(),
                total_files: fileIds.length.toString(),
                primary_message_id: primaryMessage.id.toString(),
                ...stringifiedMetadata
              }
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

async function createThreadRunAndWait({
  sessionId,
  userId,
  messageId,
  metadata = {}
}: {
  sessionId: string;
  userId: string;
  messageId: string;
  metadata?: Record<string, any>;
}) {
  try {
    // Get session details
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single()

    if (sessionError) {
      console.error('Error fetching session:', sessionError)
      throw new Error('Session not found')
    }

    const threadId = session.thread_id
    const assistantId = session.assistant_id

    if (!threadId || !assistantId) {
      console.error('Thread ID or Assistant ID not found in session')
      throw new Error('Thread ID or Assistant ID not found in session')
    }

    // Create a new run
    console.log('Creating a new run for thread:', threadId)
    const run = await openai.beta.threads.runs.create(
      threadId,
      {
        assistant_id: assistantId,
        tools: [{ type: "code_interpreter" }],
        metadata: {
          user_id: userId.toString(),
          session_id: sessionId.toString(),
          message_id: messageId.toString(),
          ...stringifyMetadata(metadata)
        },
      },
      { headers: v2Headers }
    )

    let runStatus = run.status
    let startTime = Date.now()

    while (runStatus !== 'completed' && runStatus !== 'failed' && Date.now() - startTime < 120000) {
      await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait for 2 seconds
      const updatedRun = await openai.beta.threads.runs.retrieve(threadId, run.id, {
        headers: v2Headers,
      })
      runStatus = updatedRun.status
      console.log(`Run status: ${runStatus}`)

      // Update message status in the database
      await updateMessageStatus(messageId, 'processing', '', {
        stage: runStatus,
        started_at: startTime,
        last_updated: Date.now(),
      })

      if (runStatus === 'requires_action') {
        console.log('Run requires action, handling function calls')
        const runSteps = await openai.beta.threads.runs.steps.list(threadId, run.id, {
          order: 'asc',
          limit: 100,
          headers: v2Headers,
        })

        for (const step of runSteps.data) {
          if (step.type === 'tool_calls' && step.status === 'in_progress') {
            for (const toolCall of step.step_details.tool_calls) {
              if (toolCall.type === 'code_interpreter') {
                // No action needed, code interpreter is running
                console.log('Code interpreter is running, no action needed')
              } else if (toolCall.type === 'function') {
                console.warn('Function calls are not supported yet')
              }
            }
          }
        }
      }
    }

    if (runStatus === 'failed') {
      console.error('Run failed')
      await updateMessageStatus(messageId, 'failed', 'Run failed', {
        stage: 'failed',
        last_updated: Date.now(),
      })
      throw new Error('Run failed')
    }

    if (runStatus !== 'completed') {
      console.error('Run timed out')
      await updateMessageStatus(messageId, 'failed', 'Run timed out', {
        stage: 'timeout',
        last_updated: Date.now(),
      })
      throw new Error('Run timed out')
    }

    // Get assistant response
    return await getAssistantResponse({ threadId, messageId })
  } catch (error) {
    console.error('Error in createThreadRunAndWait:', error)
    await updateMessageStatus(messageId, 'failed', error.message, {
      stage: 'failed',
      last_updated: Date.now(),
      error: error.message,
    })
    throw error
  }
}

async function getAssistantResponse({ threadId, messageId }: { threadId: string; messageId: string }) {
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
    let images = [];

    for (const contentPart of assistantMessage.content) {
      if (contentPart.type === "text") {
        responseContent += contentPart.text.value + "\n\n";
      } else if (contentPart.type === "image_file") {
        // Extract image file ID from OpenAI response
        const fileId = contentPart.image_file.file_id;
        images.push({
          openai_file_id: fileId,
          message_id: messageId
        });
      }
    }

    // Construct a better response with image references
    let finalResponse = responseContent.trim();
    
    // Store the images in Supabase if any were generated
    if (images.length > 0) {
      console.log(`Storing ${images.length} generated images in database`);
      try {
        const { error } = await supabaseAdmin
          .from("message_generated_images")
          .insert(images);

        if (error) {
          console.error("Error saving image file IDs:", error);
        } else {
          console.log("Successfully stored image references");
          
          // Add markdown image references to the message
          finalResponse += `\n\n## Generated Images\n\n`;
          images.forEach((img, index) => {
            finalResponse += `![Generated Image ${index + 1}](/api/images/${img.openai_file_id})\n\n`;
          });
        }
      } catch (storeError) {
        console.error("Exception storing images:", storeError);
      }
    }

    // Update message with response
    await updateMessageStatus(messageId, "completed", finalResponse, {
      stage: "completed",
      completion_percentage: "100",
      openai_message_id: assistantMessage.id,
      has_images: images.length > 0 ? "true" : "false",
      image_count: images.length.toString()
    });

    return { content: finalResponse, messageId: assistantMessage.id };
  } catch (error) {
    console.error("Error in getAssistantResponse:", error);
    throw new Error(`Failed to get assistant response: ${error.message}`);
  }
}
