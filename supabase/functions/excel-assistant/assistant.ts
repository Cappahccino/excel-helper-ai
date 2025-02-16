
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
  updateMessage: (content: string, isComplete: boolean, rawResponse?: any) => Promise<void>,
  maxDuration: number = 60000
): Promise<string> {
  let accumulatedContent = "";
  let lastContentCheck = 0;
  let startTime = Date.now();
  let lastMessageId: string | null = null;
  let retryCount = 0;
  const maxRetries = 3;

  console.log(`Starting response stream for thread ${threadId}, run ${runId}`);

  while (Date.now() - startTime < maxDuration) {
    try {
      const run = await openai.beta.threads.runs.retrieve(threadId, runId);
      console.log(`Run status: ${run.status}`);

      if (run.status === "failed" || run.status === "cancelled" || run.status === "expired") {
        throw new Error(`Assistant run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
      }

      if (run.status === "completed" || run.status === "in_progress") {
        if (Date.now() - lastContentCheck >= 1000) {
          lastContentCheck = Date.now();

          const messages = await openai.beta.threads.messages.list(threadId, {
            order: "desc",
            limit: 1
          });

          if (messages.data.length > 0) {
            const message = messages.data[0];
            
            if (message.id !== lastMessageId && message.role === "assistant") {
              lastMessageId = message.id;
              console.log('New message received:', message.id);
              console.log('Raw message content:', JSON.stringify(message.content));
              
              let messageContent = "";
              for (const contentPart of message.content) {
                if (contentPart.type === 'text' && contentPart.text?.value) {
                  messageContent += contentPart.text.value;
                }
              }

              if (messageContent) {
                accumulatedContent = messageContent;
                console.log(`Extracted message content (${accumulatedContent.length} chars):`, accumulatedContent.substring(0, 100) + '...');
                
                await updateMessage(
                  accumulatedContent, 
                  run.status === "completed",
                  message
                );
                retryCount = 0;
              } else {
                console.warn('No text content found in message:', message);
              }
            }
          }
        }

        if (run.status === "completed") {
          console.log("Assistant response complete");
          await updateMessage(accumulatedContent, true);
          return accumulatedContent;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Error in streamAssistantResponse:', error);
      retryCount++;
      
      if (retryCount >= maxRetries) {
        throw new Error(`Failed to process response after ${maxRetries} retries: ${error.message}`);
      }
      
      await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
    }
  }

  console.warn("Response streaming timed out");
  throw new Error('Response streaming timed out');
}
