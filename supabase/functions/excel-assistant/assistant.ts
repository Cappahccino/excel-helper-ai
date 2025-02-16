
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

  while (Date.now() - startTime < maxDuration) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    console.log(`Run status: ${run.status}`);

    const shouldCheckContent =
      run.status === "completed" ||
      (run.status === "in_progress" &&
        Date.now() - lastContentCheck >= 1000);

    if (shouldCheckContent) {
      lastContentCheck = Date.now();

      const messages = await openai.beta.threads.messages.list(threadId, {
        order: "desc",
        limit: 1
      });

      if (messages.data.length > 0) {
        const message = messages.data[0];
        if (message.role === "assistant" && message.content && message.content[0] && message.content[0].text) {
          accumulatedContent = message.content[0].text.value;
          await updateMessage(accumulatedContent, false);
        }
      }
    }

    if (run.status === "completed") {
      console.log("Assistant response complete.");
      await updateMessage(accumulatedContent, true);
      return accumulatedContent;
    } else if (run.status === "failed" || run.status === "cancelled" || run.status === "expired") {
      throw new Error(`Assistant run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.warn("Timeout reached, stopping polling.");
  throw new Error('Response streaming timed out');
}
