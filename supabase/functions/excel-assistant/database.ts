
import { Message } from './types.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function createInitialMessage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string,
  content: string,
  isAiResponse: boolean,
  requestId: string
) {
  console.log(`[${requestId}] Creating initial message:`, {
    sessionId,
    isAiResponse,
    contentLength: content?.length
  });

  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      content: content || '',
      role: isAiResponse ? 'assistant' : 'user',
      session_id: sessionId,
      user_id: userId,
      is_ai_response: isAiResponse,
      status: isAiResponse ? 'in_progress' : 'completed',
      version: '1.0.0',
      metadata: isAiResponse ? {
        processing_stage: {
          stage: 'generating',
          started_at: Date.now(),
          last_updated: Date.now()
        }
      } : null
    })
    .select('*, excel_files(filename, file_size)')
    .single();

  if (error) {
    console.error(`[${requestId}] Error creating message:`, error);
    throw error;
  }

  return message;
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
    contentLength: content?.length,
    isComplete
  });

  const { error } = await supabase
    .from('chat_messages')
    .update({
      content,
      status: isComplete ? 'completed' : 'in_progress',
      metadata: {
        processing_stage: {
          stage: isComplete ? 'completed' : 'generating',
          started_at: Date.now(),
          last_updated: Date.now(),
          completion_percentage: isComplete ? 100 : undefined
        }
      }
    })
    .eq('id', messageId);

  if (error) {
    console.error(`[${requestId}] Error updating message:`, error);
    throw error;
  }
}

export async function getOrCreateSession(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string | null,
  fileId: string | null,
  requestId: string
) {
  if (sessionId) {
    console.log(`[${requestId}] Using existing session:`, { sessionId });
    return { session_id: sessionId };
  }

  console.log(`[${requestId}] Creating new session for user:`, { userId });
  const { data: session, error } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: userId,
      excel_file_id: fileId,
      status: 'active',
      chat_name: 'New Chat'
    })
    .select()
    .single();

  if (error) {
    console.error(`[${requestId}] Error creating session:`, error);
    throw error;
  }

  return session;
}

export async function updateSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  updates: Record<string, unknown>,
  requestId: string
) {
  console.log(`[${requestId}] Updating session:`, {
    sessionId,
    updates: Object.keys(updates)
  });

  const { error } = await supabase
    .from('chat_sessions')
    .update(updates)
    .eq('session_id', sessionId);

  if (error) {
    console.error(`[${requestId}] Error updating session:`, error);
    throw error;
  }
}
