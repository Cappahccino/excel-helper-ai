
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
  updateMessage: (content: string, isComplete: boolean, raw?: any) => Promise<void>,
  maxDuration: number = 20000 // Reduced to 20 seconds
): Promise<string> {
  let accumulatedContent = "";
  const startTime = Date.now();
  let lastMessageId: string | null = null;

  while (Date.now() - startTime < maxDuration) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);

    if (run.status === "completed" || run.status === "in_progress") {
      const messages = await openai.beta.threads.messages.list(threadId, {
        order: "desc",
        limit: 1
      });

      if (!messages.data.length) continue;

      const message = messages.data[0];

      if (message.id !== lastMessageId && message.role === "assistant") {
        lastMessageId = message.id;

        // Only store essential information from the message
        const rawMessage = {
          id: message.id,
          role: message.role
        };

        const textContent = message.content.find(content => content.type === 'text');
        if (textContent?.text?.value) {
          accumulatedContent = textContent.text.value;

          await updateMessage(
            accumulatedContent,
            run.status === "completed",
            rawMessage
          );

          if (run.status === "completed") {
            return accumulatedContent;
          }
        }
      }
    } else if (run.status === "failed" || run.status === "cancelled" || run.status === "expired") {
      throw new Error(`Assistant run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000)); // Increased polling interval
  }

  throw new Error("Response timeout");
}
