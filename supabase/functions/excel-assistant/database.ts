
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const DEPLOYMENT_ID = crypto.randomUUID();
const VERSION = '1.0.0';

interface MessageState {
  isValid: boolean;
  isStuck: boolean;
  currentStatus: string;
}

async function validateMessageState(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  requestId: string
): Promise<MessageState> {
  console.log(`[${requestId}] Validating message state:`, {
    messageId,
    operation: 'validate_message_state',
    deploymentId: DEPLOYMENT_ID,
    version: VERSION
  });

  const { data: message, error } = await supabase
    .from('chat_messages')
    .select('status, role, created_at, processing_stage')
    .eq('id', messageId)
    .single();

  if (error || !message) {
    console.error(`[${requestId}] Message validation failed:`, {
      error: error?.message || 'Message not found',
      messageId,
      deploymentId: DEPLOYMENT_ID,
      version: VERSION
    });
    throw new Error(`Message validation failed: ${error?.message || 'Message not found'}`);
  }

  const messageAge = Date.now() - new Date(message.created_at).getTime();
  const isStuck = messageAge > 5 * 60 * 1000 && message.status === 'in_progress';

  return {
    isValid: message.role === 'assistant' && ['queued', 'in_progress'].includes(message.status),
    isStuck,
    currentStatus: message.status
  };
}

async function cleanupStuckMessages(
  supabase: ReturnType<typeof createClient>,
  requestId: string
) {
  console.log(`[${requestId}] Cleaning up stuck messages`, {
    operation: 'cleanup_stuck_messages',
    deploymentId: DEPLOYMENT_ID,
    version: VERSION
  });

  const stuckTimeout = new Date(Date.now() - 5 * 60 * 1000);

  const { error } = await supabase
    .from('chat_messages')
    .update({
      status: 'failed',
      content: 'Message processing timed out.',
      cleanup_reason: 'stuck_in_progress',
      cleanup_after: new Date(Date.now() + 24 * 60 * 60 * 1000)
    })
    .eq('status', 'in_progress')
    .lt('created_at', stuckTimeout.toISOString())
    .is('deleted_at', null);

  if (error) {
    console.error(`[${requestId}] Error cleaning up stuck messages:`, {
      error: error.message,
      context: { operation: 'cleanup_stuck_messages' },
      deploymentId: DEPLOYMENT_ID,
      version: VERSION
    });
  }
}

export async function updateStreamingMessage(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  content: string,
  isComplete: boolean,
  requestId: string
) {
  console.log(`[${requestId}] Updating streaming message:`, {
    messageId,
    contentLength: content.length,
    isComplete,
    operation: 'update_streaming_message',
    deploymentId: DEPLOYMENT_ID,
    version: VERSION
  });

  const { isValid, isStuck } = await validateMessageState(supabase, messageId, requestId);

  if (isStuck) {
    await cleanupStuckMessages(supabase, requestId);
    throw new Error('Message processing timed out');
  }

  if (!isValid) {
    throw new Error('Invalid message state for update');
  }

  const status = isComplete ? 'completed' : 'in_progress';
  const processingStage = {
    stage: isComplete ? 'completed' : 'generating',
    last_updated: Math.floor(Date.now() / 1000),
    completion_percentage: isComplete ? 100 : Math.min(90, (content.length / 500) * 100)
  };

  const { data, error } = await supabase
    .from('chat_messages')
    .update({
      content,
      status,
      processing_stage: processingStage,
      version: VERSION,
      deployment_id: DEPLOYMENT_ID
    })
    .eq('id', messageId)
    .eq('role', 'assistant')
    .in('status', ['queued', 'in_progress'])
    .select()
    .single();

  if (error) {
    console.error(`[${requestId}] Error updating message:`, {
      error: error.message,
      messageId,
      context: { operation: 'update_streaming_message' },
      deploymentId: DEPLOYMENT_ID,
      version: VERSION
    });

    await supabase
      .from('chat_messages')
      .update({
        status: 'failed',
        content: `Error: ${error.message || 'Unknown error occurred during response generation'}`,
        cleanup_reason: 'update_error',
        cleanup_after: new Date(Date.now() + 24 * 60 * 60 * 1000),
        processing_stage: {
          stage: 'failed',
          error: error.message,
          last_updated: Math.floor(Date.now() / 1000)
        }
      })
      .eq('id', messageId)
      .eq('role', 'assistant');

    throw error;
  }

  console.log(`[${requestId}] Message updated successfully:`, {
    messageId,
    status,
    updatedAt: data?.updated_at,
    deploymentId: DEPLOYMENT_ID,
    version: VERSION
  });
}

export async function createInitialMessage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string,
  fileId: string | null,
  requestId: string,
  role: 'user' | 'assistant' = 'assistant'
) {
  console.log(`[${requestId}] Creating initial message:`, {
    userId,
    sessionId,
    fileId,
    role,
    operation: 'create_initial_message',
    deploymentId: DEPLOYMENT_ID,
    version: VERSION
  });

  const initialStatus = role === 'user' ? 'completed' : 'queued';
  const processingStage = {
    stage: role === 'user' ? 'completed' : 'created',
    started_at: Math.floor(Date.now() / 1000),
    last_updated: Math.floor(Date.now() / 1000)
  };

  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: userId,
      session_id: sessionId,
      excel_file_id: fileId,
      content: '',
      role,
      is_ai_response: role === 'assistant',
      status: initialStatus,
      processing_stage: processingStage,
      version: VERSION,
      deployment_id: DEPLOYMENT_ID
    })
    .select()
    .single();

  if (error) {
    console.error(`[${requestId}] Error creating initial message:`, {
      error: error.message,
      context: { operation: 'create_initial_message' },
      deploymentId: DEPLOYMENT_ID,
      version: VERSION
    });
    throw error;
  }

  console.log(`[${requestId}] Initial message created:`, {
    messageId: message.id,
    sessionId: message.session_id,
    status: message.status,
    deploymentId: DEPLOYMENT_ID,
    version: VERSION
  });

  return message;
}

export async function getOrCreateSession(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string | null,
  fileId: string | null,
  requestId: string
) {
  if (sessionId) {
    console.log(`[${requestId}] Fetching existing session:`, {
      sessionId,
      userId,
      operation: 'get_session',
      deploymentId: DEPLOYMENT_ID,
      version: VERSION
    });

    const { data: session, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      console.error(`[${requestId}] Error fetching session:`, {
        error: error.message,
        sessionId,
        context: { operation: 'get_session' },
        details: error.details,
        deploymentId: DEPLOYMENT_ID,
        version: VERSION
      });
      throw new Error(`Failed to get session: ${error.message}`);
    }

    console.log(`[${requestId}] Session retrieved:`, {
      sessionId: session.session_id,
      threadId: session.thread_id,
      status: session.status,
      deploymentId: DEPLOYMENT_ID,
      version: VERSION
    });

    return session;
  }

  console.log(`[${requestId}] Creating new session:`, {
    userId,
    fileId,
    operation: 'create_session',
    deploymentId: DEPLOYMENT_ID,
    version: VERSION
  });

  const { data: session, error } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: userId,
      excel_file_id: fileId,
      status: 'active'
    })
    .select()
    .single();

  if (error) {
    console.error(`[${requestId}] Error creating session:`, {
      error: error.message,
      context: { operation: 'create_session' },
      details: error.details,
      deploymentId: DEPLOYMENT_ID,
      version: VERSION
    });
    throw new Error(`Failed to create session: ${error.message}`);
  }

  console.log(`[${requestId}] New session created:`, {
    sessionId: session.session_id,
    status: session.status,
    createdAt: session.created_at,
    deploymentId: DEPLOYMENT_ID,
    version: VERSION
  });

  return session;
}

export async function updateSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  data: Record<string, any>,
  requestId: string
) {
  console.log(`[${requestId}] Updating session:`, {
    sessionId,
    updateData: data,
    operation: 'update_session',
    deploymentId: DEPLOYMENT_ID,
    version: VERSION
  });

  const { error } = await supabase
    .from('chat_sessions')
    .update(data)
    .eq('session_id', sessionId);

  if (error) {
    console.error(`[${requestId}] Error updating session:`, {
      error: error.message,
      sessionId,
      context: { operation: 'update_session' },
      details: error.details,
      deploymentId: DEPLOYMENT_ID,
      version: VERSION
    });
    throw new Error(`Failed to update session: ${error.message}`);
  }

  console.log(`[${requestId}] Session updated successfully:`, {
    sessionId,
    updatedFields: Object.keys(data),
    deploymentId: DEPLOYMENT_ID,
    version: VERSION
  });
}
