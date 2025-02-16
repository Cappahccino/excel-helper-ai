
import OpenAI from 'npm:openai';
import { ASSISTANT_INSTRUCTIONS } from './config.ts';

export async function getOrCreateAssistant(openai: OpenAI, requestId: string): Promise<string> {
  try {
    const existingAssistantId = Deno.env.get('EXCEL_ASSISTANT_ID');
    if (existingAssistantId) {
      console.log(`[${requestId}] Using existing assistant:`, existingAssistantId);
      return existingAssistantId;
    }

    const assistant = await openai.beta.assistants.create({
      name: "Excel Analysis Assistant",
      instructions: ASSISTANT_INSTRUCTIONS,
      model: "gpt-4-turbo",
      tools: [{ type: "code_interpreter" }],
    });

    console.log(`[${requestId}] Created new assistant:`, {
      assistantId: assistant.id,
      model: assistant.model,
      tools: assistant.tools
    });
    return assistant.id;
  } catch (error) {
    console.error(`[${requestId}] Error in getOrCreateAssistant:`, {
      error: error.message,
      stack: error.stack,
      context: { operation: 'assistant_creation' }
    });
    throw error;
  }
}

export async function getThreadMessages(
  openai: OpenAI,
  threadId: string,
  requestId: string,
  limit: number = 10
): Promise<any[]> {
  try {
    console.log(`[${requestId}] Fetching thread messages:`, {
      threadId,
      limit,
      operation: 'get_thread_messages'
    });

    const messages = await openai.beta.threads.messages.list(threadId, {
      order: 'desc',
      limit
    });

    console.log(`[${requestId}] Thread messages retrieved:`, {
      threadId,
      messageCount: messages.data.length,
      firstMessageId: messages.data[0]?.id,
      lastMessageId: messages.data[messages.data.length - 1]?.id
    });

    return messages.data;
  } catch (error) {
    console.error(`[${requestId}] Error fetching thread messages:`, {
      error: error.message,
      threadId,
      context: { operation: 'get_thread_messages' },
      stack: error.stack
    });
    throw error;
  }
}

export async function streamAssistantResponse(
  openai: OpenAI, 
  threadId: string, 
  runId: string,
  requestId: string,
  updateMessage: (content: string, isComplete: boolean) => Promise<void>,
  maxDuration: number = 60000
): Promise<string> {
  let accumulatedContent = "";
  let lastContentCheck = 0;
  let startTime = Date.now();
  
  console.log(`[${requestId}] Starting assistant response stream:`, {
    threadId,
    runId,
    maxDuration,
    startTime: new Date(startTime).toISOString()
  });

  while (Date.now() - startTime < maxDuration) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    console.log(`[${requestId}] Run status update:`, {
      threadId,
      runId,
      status: run.status,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      elapsedTime: Date.now() - startTime
    });

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
        console.log(`[${requestId}] Content check:`, {
          messageId: message.id,
          role: message.role,
          hasContent: !!message.content,
          contentType: message.content?.[0]?.type,
          contentLength: message.content?.[0]?.text?.value?.length
        });

        if (message.role === "assistant" && message.content && message.content[0] && message.content[0].text) {
          accumulatedContent = message.content[0].text.value;
          await updateMessage(accumulatedContent, false);
          
          console.log(`[${requestId}] Content updated:`, {
            messageId: message.id,
            contentLength: accumulatedContent.length,
            isStreaming: true
          });
        }
      }
    }

    if (run.status === "completed") {
      console.log(`[${requestId}] Assistant response complete:`, {
        threadId,
        runId,
        finalContentLength: accumulatedContent.length,
        totalTime: Date.now() - startTime
      });
      
      await updateMessage(accumulatedContent, true);
      return accumulatedContent;
    } else if (run.status === "failed" || run.status === "cancelled" || run.status === "expired") {
      const error = new Error(`Assistant run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
      console.error(`[${requestId}] Run failed:`, {
        threadId,
        runId,
        status: run.status,
        error: run.last_error,
        totalTime: Date.now() - startTime
      });
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.warn(`[${requestId}] Stream timeout:`, {
    threadId,
    runId,
    totalTime: Date.now() - startTime,
    maxDuration
  });
  throw new Error('Response streaming timed out');
}
