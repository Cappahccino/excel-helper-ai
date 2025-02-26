
import { supabase } from "@/integrations/supabase/client";

export async function createSession(userId: string) {
  const { data: session, error } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: userId,
      status: 'active',
      chat_name: 'Untitled Chat',
      thread_level: 0,
      thread_position: 0,
      thread_metadata: {
        title: null,
        summary: null
      }
    })
    .select('session_id')
    .single();

  if (error) {
    console.error('Error creating session:', error);
    throw error;
  }

  if (!session) {
    throw new Error('Failed to create session');
  }

  return session;
}

export async function ensureSessionFiles(sessionId: string, fileIds: string[]) {
  try {
    // Get existing session files to avoid duplicates
    const { data: existingFiles } = await supabase
      .from('session_files')
      .select('file_id')
      .eq('session_id', sessionId);

    const existingFileIds = new Set(existingFiles?.map(f => f.file_id) || []);

    // Filter out files that already exist
    const newFileIds = fileIds.filter(id => !existingFileIds.has(id));

    if (newFileIds.length > 0) {
      // Create new session_files entries
      const { error } = await supabase
        .from('session_files')
        .insert(
          newFileIds.map(fileId => ({
            session_id: sessionId,
            file_id: fileId,
            is_active: true
          }))
        );

      if (error) {
        console.error('Error creating session files:', error);
        throw error;
      }
    }

    // Update all files to be active
    const { error: updateError } = await supabase
      .from('session_files')
      .update({ is_active: true })
      .eq('session_id', sessionId)
      .in('file_id', fileIds);

    if (updateError) {
      console.error('Error updating session files:', updateError);
      throw updateError;
    }

    console.log('Successfully ensured session files:', fileIds);
  } catch (error) {
    console.error('Error in ensureSessionFiles:', error);
    throw error;
  }
}
