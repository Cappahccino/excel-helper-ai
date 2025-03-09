
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Creates a new chat session
 * @param userId User ID to associate with the session
 * @returns The created session object
 */
export async function createSession(userId: string) {
  try {
    console.log('Creating new session for user:', userId);
    
    if (!userId) {
      console.error('No user ID provided to createSession');
      throw new Error('User ID is required to create a session');
    }
    
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
      console.error('No session returned after creation');
      throw new Error('Failed to create session');
    }

    console.log('Successfully created session:', session.session_id);
    return session;
  } catch (error) {
    console.error('Fatal error in createSession:', error);
    toast.error('Failed to create chat session');
    throw error;
  }
}

/**
 * Simplified file status verification
 */
async function verifyFileStatus(fileIds: string[]): Promise<void> {
  try {
    if (!fileIds || fileIds.length === 0) {
      console.log('No files to verify');
      return;
    }
    
    console.log('Checking file status for:', fileIds);
    
    const { data: files, error } = await supabase
      .from('excel_files')
      .select('id, processing_status, storage_verified')
      .in('id', fileIds);
      
    if (error) {
      console.error('Error checking file status:', error);
      return;
    }
    
    // Identify unverified files
    const unverifiedFiles = files?.filter(file => 
      !file.storage_verified || file.processing_status !== 'completed'
    ).map(file => file.id) || [];
    
    if (unverifiedFiles.length === 0) {
      console.log('All files are verified and ready');
      return;
    }
    
    // Just trigger verification and continue
    console.log('Triggering verification for files:', unverifiedFiles);
    await supabase.functions.invoke('verify-storage', {
      body: { fileIds: unverifiedFiles }
    });
    
  } catch (error) {
    console.error('Error in verifyFileStatus:', error);
  }
}

/**
 * Ensures files are associated with a session
 * @param sessionId Session ID to associate files with
 * @param fileIds Array of file IDs to associate
 */
export async function ensureSessionFiles(sessionId: string, fileIds: string[]) {
  try {
    if (!sessionId) {
      console.error('No session ID provided to ensureSessionFiles');
      return;
    }
    
    if (!fileIds || fileIds.length === 0) {
      console.log('No files to associate with session:', sessionId);
      return;
    }
    
    console.log('Ensuring session files:', { sessionId, fileIds });

    // Get existing session files
    const { data: existingFiles, error: fetchError } = await supabase
      .from('session_files')
      .select('file_id')
      .eq('session_id', sessionId);
      
    if (fetchError) {
      console.error('Error fetching existing session files:', fetchError);
      throw fetchError;
    }

    const existingFileIds = new Set(existingFiles?.map(f => f.file_id) || []);

    // Filter out files that already exist
    const newFileIds = fileIds.filter(id => !existingFileIds.has(id));

    // Create new session_files entries if needed
    if (newFileIds.length > 0) {
      console.log('Adding new files to session:', newFileIds);
      
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

    // Ensure all files are marked as active
    if (fileIds.length > 0) {
      const { error: updateError } = await supabase
        .from('session_files')
        .update({ is_active: true })
        .eq('session_id', sessionId)
        .in('file_id', fileIds);

      if (updateError) {
        console.error('Error updating session files:', updateError);
        throw updateError;
      }
    }

    // Trigger file verification but don't wait for it
    verifyFileStatus(fileIds).catch(err => {
      console.error('Background verification error:', err);
    });

    console.log('Successfully ensured session files');
  } catch (error) {
    console.error('Error in ensureSessionFiles:', error);
    toast.error('Failed to associate files with session');
    throw error;
  }
}
