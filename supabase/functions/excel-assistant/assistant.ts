
import OpenAI from "https://esm.sh/openai@4.20.1";
import { ASSISTANT_INSTRUCTIONS } from "./config.ts";
import { supabaseAdmin } from "./database.ts";

// Ensure v2 headers are present for all API calls
const v2Headers = {
  "OpenAI-Beta": "assistants=v2"
};

export async function createAssistant(openai: OpenAI) {
  try {
    // First try to get an existing assistant
    const { data: sessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('assistant_id')
      .not('assistant_id', 'is', null)
      .limit(1);

    if (sessions?.[0]?.assistant_id) {
      try {
        // Use v2 headers explicitly
        const existingAssistant = await openai.beta.assistants.retrieve(
          sessions[0].assistant_id,
          { headers: v2Headers }
        );
        console.log('Using existing assistant:', existingAssistant.id);
        return existingAssistant;
      } catch (error) {
        console.warn('Could not retrieve existing assistant:', error);
      }
    }

    // Create a new assistant if none exists with v2 headers
    const assistant = await openai.beta.assistants.create({
      name: "Excel Analysis Assistant",
      instructions: ASSISTANT_INSTRUCTIONS,
      model: "gpt-4-turbo",
      tools: [
        { type: "retrieval" },
        { type: "code_interpreter" }
      ]
    }, { headers: v2Headers });

    console.log('Created new assistant:', assistant.id);
    return assistant;
  } catch (error) {
    console.error('Error in createAssistant:', error);
    throw error;
  }
}

export async function processFileWithAssistant({
  openai,
  assistant,
  query,
  fileContents,
  threadId: existingThreadId,
  messageId,
  sessionId
}: {
  openai: OpenAI;
  assistant: any;
  query: string;
  fileContents: any[];
  threadId: string | null;
  messageId: string;
  sessionId: string;
}) {
  try {
    // Create or retrieve thread with v2 headers
    const thread = existingThreadId 
      ? await openai.beta.threads.retrieve(existingThreadId, { headers: v2Headers })
      : await openai.beta.threads.create({}, { headers: v2Headers });

    console.log('Using thread:', thread.id);

    // Update session with thread ID if it's new
    if (!existingThreadId) {
      await supabaseAdmin
        .from('chat_sessions')
        .update({ 
          thread_id: thread.id,
          updated_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);
    }

    // Prepare file context
    const fileContext = fileContents.map(file => `
      Filename: ${file.filename}
      Sheets: ${file.sheets.map((sheet: any) => `
        - ${sheet.name} (${sheet.rowCount} rows × ${sheet.columnCount} columns)
        Preview: ${JSON.stringify(sheet.preview)}`).join('\n')}
    `).join('\n');

    // Add message to thread with v2 format and explicit v2 headers
    const message = await openai.beta.threads.messages.create(
      thread.id, 
      {
        role: "user",
        content: [{ type: "text", text: `Context: ${fileContext}\n\nUser Query: ${query}` }]
      },
      { headers: v2Headers }
    );

    // Update message with OpenAI ID
    await supabaseAdmin
      .from('chat_messages')
      .update({ 
        thread_message_id: message.id,
        status: 'processing',
        metadata: {
          processing_stage: {
            stage: 'analyzing',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId);

    // Run the assistant with v2 headers
    const run = await openai.beta.threads.runs.create(
      thread.id, 
      {
        assistant_id: assistant.id
      },
      { headers: v2Headers }
    );

    // Poll for completion and handle different statuses
    let completedRun;
    let attempts = 0;
    
    while (attempts < 30) { // Maximum 30 attempts
      attempts++;
      // Use v2 headers in run retrieval
      const runStatus = await openai.beta.threads.runs.retrieve(
        thread.id, 
        run.id,
        { headers: v2Headers }
      );

      console.log(`Run status: ${runStatus.status}, attempt: ${attempts}`);

      // Update message status (progress tracking)
      const completionPercentage = Math.min(25 + (attempts * 5), 90);
      await supabaseAdmin
        .from('chat_messages')
        .update({
          metadata: {
            processing_stage: {
              stage: 'generating',
              started_at: Date.now(),
              last_updated: Date.now(),
              completion_percentage: completionPercentage
            }
          }
        })
        .eq('id', messageId);

      if (runStatus.status === 'completed') {
        completedRun = runStatus;
        break;
      } else if (['failed', 'cancelled', 'expired'].includes(runStatus.status)) {
        throw new Error(`Run ${runStatus.status}: ${runStatus.last_error?.message || 'Unknown error'}`);
      } else if (runStatus.status === "requires_action") {
        console.warn("Run requires action, but no handler is implemented.");
        throw new Error("Run requires action, which is not yet supported.");
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!completedRun) {
      throw new Error('Run polling timed out');
    }

    // Get the assistant's response with v2 format and headers
    const messages = await openai.beta.threads.messages.list(
      thread.id,
      { limit: 10, order: 'desc' },
      { headers: v2Headers }
    );
    
    const lastMessage = messages.data.find(msg => msg.run_id === completedRun.id && msg.role === 'assistant');

    if (!lastMessage) {
      throw new Error('No response message found');
    }

    // Extract content from different content types
    let responseText = '';
    let hasCodeOutput = false;
    let codeOutputs = [];
    
    for (const contentPart of lastMessage.content) {
      if (contentPart.type === 'text') {
        responseText += contentPart.text.value;
      } else if (contentPart.type === 'image_file') {
        hasCodeOutput = true;
        responseText += `\n\n[Image Generated: Code Interpreter Output]\n\n`;
        codeOutputs.push({
          type: 'image',
          file_id: contentPart.image_file.file_id
        });
      }
    }

    if (!responseText.trim()) {
      throw new Error('Empty assistant response');
    }

    // Update the chat message with the response
    await supabaseAdmin
      .from('chat_messages')
      .update({
        content: responseText,
        status: 'completed',
        openai_message_id: lastMessage.id,
        metadata: {
          processing_stage: {
            stage: 'completed',
            started_at: Date.now(),
            last_updated: Date.now(),
            completion_percentage: 100
          },
          has_code_output: hasCodeOutput,
          code_outputs: codeOutputs.length ? codeOutputs : undefined
        }
      })
      .eq('id', messageId);

    return {
      threadId: thread.id,
      messageId: lastMessage.id,
      content: responseText
    };
  } catch (error) {
    console.error('Error in processFileWithAssistant:', error);

    // Ensure failure is properly updated in Supabase
    await supabaseAdmin
      .from('chat_messages')
      .update({
        status: 'failed',
        content: error.message || 'Failed to process request. Please try again.',
        metadata: {
          error: error.message,
          processing_stage: {
            stage: 'failed',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId);

    throw error;
  }
}
