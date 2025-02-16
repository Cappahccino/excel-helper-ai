
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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
    operation: 'update_streaming_message'
  });

  const { data, error } = await supabase
    .from('chat_messages')
    .update({
      content,
      is_streaming: !isComplete
    })
    .eq('id', messageId)
    .select();

  if (error) {
    console.error(`[${requestId}] Error updating message:`, {
      error: error.message,
      messageId,
      context: { operation: 'update_streaming_message' },
      details: error.details
    });
  } else {
    console.log(`[${requestId}] Message updated successfully:`, {
      messageId,
      isComplete,
      updatedAt: data?.[0]?.updated_at
    });
  }
}

export async function createInitialMessage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string,
  fileId: string | null,
  requestId: string
) {
  console.log(`[${requestId}] Creating initial message:`, {
    userId,
    sessionId,
    fileId,
    operation: 'create_initial_message'
  });

  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: userId,
      session_id: sessionId,
      excel_file_id: fileId,
      content: '',
      role: 'assistant',
      is_ai_response: true,
      is_streaming: true
    })
    .select()
    .single();

  if (error) {
    console.error(`[${requestId}] Error creating initial message:`, {
      error: error.message,
      context: { operation: 'create_initial_message' },
      details: error.details
    });
    throw new Error(`Failed to create initial message: ${error.message}`);
  }

  console.log(`[${requestId}] Initial message created:`, {
    messageId: message.id,
    sessionId: message.session_id,
    createdAt: message.created_at
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
      operation: 'get_session'
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
        details: error.details
      });
      throw new Error(`Failed to get session: ${error.message}`);
    }

    console.log(`[${requestId}] Session retrieved:`, {
      sessionId: session.session_id,
      threadId: session.thread_id,
      status: session.status
    });

    return session;
  }

  console.log(`[${requestId}] Creating new session:`, {
    userId,
    fileId,
    operation: 'create_session'
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
      details: error.details
    });
    throw new Error(`Failed to create session: ${error.message}`);
  }

  console.log(`[${requestId}] New session created:`, {
    sessionId: session.session_id,
    status: session.status,
    createdAt: session.created_at
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
    operation: 'update_session'
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
      details: error.details
    });
    throw new Error(`Failed to update session: ${error.message}`);
  }

  console.log(`[${requestId}] Session updated successfully:`, {
    sessionId,
    updatedFields: Object.keys(data)
  });
}
