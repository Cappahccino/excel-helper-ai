
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

export async function updateStreamingMessage(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  content: string,
  isComplete: boolean,
  rawMessage?: any
) {
  console.log(`🔄 Updating message ${messageId}`);
  console.log(`Content length: ${content?.length || 0}`);
  console.log('Content preview:', content?.substring(0, 100));

  try {
    const updateData = {
      content: content || '', // Never store null content
      is_streaming: !isComplete,
      raw_response: rawMessage || null,
      status: isComplete ? 'completed' : 'streaming'
    };

    console.log('Update payload:', JSON.stringify(updateData, null, 2));

    const { data, error } = await supabase
      .from('chat_messages')
      .update(updateData)
      .eq('id', messageId)
      .select();

    if (error) {
      console.error('❌ Database update error:', error);
      throw error;
    }

    console.log(`✅ Message ${messageId} updated successfully:`, data);
    return data;
  } catch (error) {
    console.error(`❌ Failed to update message ${messageId}:`, error);
    throw error;
  }
}

export async function createInitialMessage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string,
  fileId: string | null
) {
  console.log('Creating initial message:', { userId, sessionId, fileId });

  try {
    const { data: message, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: userId,
        session_id: sessionId,
        excel_file_id: fileId,
        content: '', // Initialize with empty string instead of null
        role: 'assistant',
        is_ai_response: true,
        is_streaming: true
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to create initial message:', error);
      throw new Error(`Failed to create initial message: ${error.message}`);
    }

    console.log('✅ Initial message created:', message);
    return message;
  } catch (error) {
    console.error('❌ Error in createInitialMessage:', error);
    throw error;
  }
}

export async function getSessionContext(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
) {
  console.log(`📝 Getting session context for ${sessionId}`);

  try {
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      console.error('❌ Failed to get session context:', error);
      throw new Error(`Failed to get session context: ${error.message}`);
    }

    console.log('✅ Session context retrieved:', session);
    return session;
  } catch (error) {
    console.error('❌ Error in getSessionContext:', error);
    throw error;
  }
}

export async function updateSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  data: Record<string, any>
) {
  console.log(`📝 Updating session ${sessionId} with:`, data);

  try {
    const { error } = await supabase
      .from('chat_sessions')
      .update(data)
      .eq('session_id', sessionId);

    if (error) {
      console.error('❌ Failed to update session:', error);
      throw new Error(`Failed to update session: ${error.message}`);
    }

    console.log('✅ Session updated successfully');
  } catch (error) {
    console.error('❌ Error in updateSession:', error);
    throw error;
  }
}
