
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

export async function updateStreamingMessage(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  content: string,
  isComplete: boolean,
  rawResponse?: any
) {
  try {
    // Validate and clean content
    const validContent = content?.trim() || '';
    console.log(`Updating message ${messageId}:`);
    console.log(`- Content length: ${validContent.length}`);
    console.log(`- Is complete: ${isComplete}`);
    console.log(`- Has raw response: ${!!rawResponse}`);

    const updateData: Record<string, any> = {
      content: validContent,
      is_streaming: !isComplete,
      status: isComplete ? 'completed' : 'streaming'
    };

    // Only include raw_response if it exists
    if (rawResponse) {
      updateData.raw_response = rawResponse;
    }

    const { error } = await supabase
      .from('chat_messages')
      .update(updateData)
      .eq('id', messageId);

    if (error) {
      console.error('Error updating message:', error);
      throw error;
    }

    console.log(`Successfully updated message ${messageId}`);
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
    console.log(`Creating initial message for session ${sessionId}`);
    const { data: message, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: userId,
        session_id: sessionId,
        excel_file_id: fileId,
        content: '',
        role: 'assistant',
        is_ai_response: true,
        is_streaming: true,
        status: 'streaming'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating initial message:', error);
      throw error;
    }
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

    if (error) {
      console.error('Error getting session context:', error);
      throw error;
    }
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

    if (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in updateSession:', error);
    throw error;
  }
}
