
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

export async function updateStreamingMessage(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  content: string,
  isComplete: boolean,
  rawMessage?: any
) {
  try {
    const updateData = {
      content: content || '',
      is_streaming: !isComplete,
      raw_response: rawMessage ? JSON.stringify(rawMessage) : null,
      status: isComplete ? 'completed' : 'streaming'
    };

    const { error } = await supabase
      .from('chat_messages')
      .update(updateData)
      .eq('id', messageId);

    if (error) throw error;
  } catch (error) {
    console.error(`Failed to update message ${messageId}:`, error);
    throw error;
  }
}

export async function createInitialMessage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string,
  fileId: string | null
) {
  try {
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

    if (error) throw error;
    return message;
  } catch (error) {
    console.error('Error in createInitialMessage:', error);
    throw error;
  }
}

export async function getSessionContext(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
) {
  try {
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error) throw error;
    return session;
  } catch (error) {
    console.error('Error in getSessionContext:', error);
    throw error;
  }
}

export async function updateSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  data: Record<string, any>
) {
  try {
    const { error } = await supabase
      .from('chat_sessions')
      .update(data)
      .eq('session_id', sessionId);

    if (error) throw error;
  } catch (error) {
    console.error('Error in updateSession:', error);
    throw error;
  }
}
