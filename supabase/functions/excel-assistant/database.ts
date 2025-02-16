
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

export async function updateStreamingMessage(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  content: string,
  isComplete: boolean
) {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      content,
      is_streaming: !isComplete
    })
    .eq('id', messageId);

  if (error) console.error('Error updating message:', error);
}

export async function createInitialMessage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string,
  fileId: string | null
) {
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

  if (error) throw new Error(`Failed to create initial message: ${error.message}`);
  return message;
}

export async function getSessionContext(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
) {
  const { data: session, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error) throw new Error(`Failed to get session context: ${error.message}`);
  return session;
}

export async function updateSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  data: Record<string, any>
) {
  const { error } = await supabase
    .from('chat_sessions')
    .update(data)
    .eq('session_id', sessionId);

  if (error) throw new Error(`Failed to update session: ${error.message}`);
}
