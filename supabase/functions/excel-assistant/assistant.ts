
import OpenAI from 'npm:openai';
import { ASSISTANT_INSTRUCTIONS } from './config.ts';

export async function getOrCreateAssistant(openai: OpenAI): Promise<string> {
  try {
    const existingAssistantId = Deno.env.get('EXCEL_ASSISTANT_ID');
    if (existingAssistantId) {
      return existingAssistantId;
    }

    const assistant = await openai.beta.assistants.create({
      name: "Excel Analysis Assistant",
      instructions: ASSISTANT_INSTRUCTIONS,
      model: "gpt-4-turbo",
      tools: [{ type: "code_interpreter" }],
    });

    console.log('Created new assistant:', assistant.id);
    return assistant.id;
  } catch (error) {
    console.error('Error getting/creating assistant:', error);
    throw error;
  }
}

export async function streamAssistantResponse(
  openai: OpenAI, 
  threadId: string, 
  runId: string, 
  updateMessage: (content: string, isComplete: boolean) => Promise<void>,
  maxDuration: number = 60000
): Promise<string> {
  let accumulatedContent = "";
  let lastContentCheck = 0;
  let startTime = Date.now();
  let lastMessageId: string | null = null;

  console.log(`🔄 Starting to stream response for run: ${runId} in thread: ${threadId}`);

  while (Date.now() - startTime < maxDuration) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    console.log(`📊 Run status: ${run.status} for run: ${runId}`);

    const shouldCheckContent =
      run.status === "completed" ||
      (run.status === "in_progress" &&
        Date.now() - lastContentCheck >= 1000);

    if (shouldCheckContent) {
      lastContentCheck = Date.now();
      console.log(`🔍 Checking for new content at ${new Date().toISOString()}`);

      try {
        // Get the latest assistant message
        const messages = await openai.beta.threads.messages.list(threadId, {
          order: "desc",
          limit: 1
        });

        if (!messages.data.length) {
          console.warn('⚠️ No messages returned from API');
          continue;
        }

        const message = messages.data[0];
        console.log(`📨 Latest message - ID: ${message.id}, Role: ${message.role}`);

        // Only update if this is a new message
        if (message.id !== lastMessageId && message.role === "assistant") {
          console.log(`🆕 New assistant message detected (ID: ${message.id})`);
          lastMessageId = message.id;

          // Extract content from the message
          if (!message.content || !Array.isArray(message.content) || !message.content.length) {
            console.warn('⚠️ Invalid message structure:', message);
            continue;
          }

          const textContent = message.content.find(content => content.type === 'text');
          if (!textContent || !textContent.text || !textContent.text.value) {
            console.warn('⚠️ No valid text content found:', message.content);
            continue;
          }

          accumulatedContent = textContent.text.value;
          console.log(`📤 Updating message with content (length: ${accumulatedContent.length})`);
          console.log('Content preview:', accumulatedContent.substring(0, 100));

          try {
            await updateMessage(accumulatedContent, false);
            console.log('✅ Message update successful');
          } catch (updateError) {
            console.error('❌ Failed to update message:', updateError);
            throw updateError;
          }
        }
      } catch (messageError) {
        console.error('❌ Error retrieving or processing messages:', messageError);
        throw messageError;
      }
    }

    if (run.status === "completed") {
      console.log("✨ Assistant response complete.");
      try {
        await updateMessage(accumulatedContent, true);
        console.log('🏁 Final message update successful');
      } catch (finalUpdateError) {
        console.error('❌ Failed to update final message:', finalUpdateError);
        throw finalUpdateError;
      }
      return accumulatedContent;
    } else if (run.status === "failed" || run.status === "cancelled" || run.status === "expired") {
      const errorMsg = `Assistant run ${run.status}: ${run.last_error?.message || 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const timeoutMsg = "Timeout reached, stopping polling.";
  console.warn(`⏰ ${timeoutMsg}`);
  throw new Error(timeoutMsg);
}
