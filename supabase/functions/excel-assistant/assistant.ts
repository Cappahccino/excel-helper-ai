
import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";
import { ASSISTANT_INSTRUCTIONS } from "./config.ts";
import { supabaseAdmin } from "./database.ts";

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
        const existingAssistant = await openai.beta.assistants.retrieve(sessions[0].assistant_id);
        console.log('Using existing assistant:', existingAssistant.id);
        return existingAssistant;
      } catch (error) {
        console.warn('Could not retrieve existing assistant:', error);
      }
    }

    // Create a new assistant if none exists
    const assistant = await openai.beta.assistants.create({
      name: "Excel Analysis Assistant",
      instructions: ASSISTANT_INSTRUCTIONS,
      model: "gpt-4-turbo-preview",
      tools: [{ type: "code_interpreter" }],
    });

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
    // Create or retrieve thread
    const thread = existingThreadId 
      ? await openai.beta.threads.retrieve(existingThreadId)
      : await openai.beta.threads.create();

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

    // Add message to thread
    const message = await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: `
        Context: ${fileContext}
        
        User Query: ${query}
      `
    });

    // Update message with OpenAI ID
    await supabaseAdmin
      .from('chat_messages')
      .update({ 
        thread_message_id: message.id,
        status: 'in_progress',
        metadata: {
          processing_stage: {
            stage: 'analyzing',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId);

    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id
    });

    // Poll for completion
    let completedRun;
    while (true) {
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      
      if (runStatus.status === 'completed') {
        completedRun = runStatus;
        break;
      } else if (runStatus.status === 'failed' || runStatus.status === 'cancelled') {
        throw new Error(`Run ${runStatus.status}: ${runStatus.last_error?.message || 'Unknown error'}`);
      }

      // Update message status
      await supabaseAdmin
        .from('chat_messages')
        .update({
          metadata: {
            processing_stage: {
              stage: 'generating',
              started_at: Date.now(),
              last_updated: Date.now(),
              completion_percentage: 50 // This is an estimate since we don't have real progress
            }
          }
        })
        .eq('id', messageId);

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Get the assistant's response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data.find(msg => 
      msg.run_id === completedRun.id && msg.role === 'assistant'
    );

    if (!lastMessage) {
      throw new Error('No response message found');
    }

    // Update the chat message with the response
    await supabaseAdmin
      .from('chat_messages')
      .update({
        content: lastMessage.content[0].text.value,
        status: 'completed',
        openai_message_id: lastMessage.id,
        metadata: {
          processing_stage: {
            stage: 'completed',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId);

    return {
      threadId: thread.id,
      messageId: lastMessage.id,
      content: lastMessage.content[0].text.value
    };
  } catch (error) {
    console.error('Error in processFileWithAssistant:', error);

    // Update message as failed
    await supabaseAdmin
      .from('chat_messages')
      .update({
        status: 'failed',
        content: 'Failed to process request. Please try again.',
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

