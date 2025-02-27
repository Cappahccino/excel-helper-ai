
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

/**
 * Verify file status and trigger verification if needed
 * @param fileIds Array of file IDs to verify
 * @returns Promise resolving to boolean indicating if files are ready
 */
async function verifyFileStatus(fileIds: string[]): Promise<boolean> {
  try {
    console.log('Verifying file status for:', fileIds);
    
    const { data: files, error } = await supabase
      .from('excel_files')
      .select('id, processing_status, storage_verified, error_message')
      .in('id', fileIds);
      
    if (error) {
      console.error('Error checking file status:', error);
      return false;
    }
    
    // Check if all files are properly verified
    const allVerified = files?.every(file => 
      file.storage_verified === true && 
      file.processing_status === 'completed'
    );
    
    if (allVerified) {
      console.log('All files are verified and ready for use');
      return true;
    }
    
    // Identify unverified files
    const unverifiedFiles = files?.filter(file => 
      !file.storage_verified || file.processing_status !== 'completed'
    ).map(file => file.id);
    
    if (!unverifiedFiles?.length) {
      console.log('No files need verification');
      return true;
    }
    
    console.log('Files needing verification:', unverifiedFiles);
    
    // Trigger verification for unverified files
    const { error: verifyError } = await supabase.functions.invoke('verify-storage', {
      body: { fileIds: unverifiedFiles }
    });
    
    if (verifyError) {
      console.error('Error triggering verification:', verifyError);
      return false;
    }
    
    console.log('Verification triggered for files');
    return false; // Return false since verification is in progress
  } catch (error) {
    console.error('Error in verifyFileStatus:', error);
    return false;
  }
}

export async function ensureSessionFiles(sessionId: string, fileIds: string[]) {
  try {
    console.log('Ensuring session files:', { sessionId, fileIds });

    // Get existing session files to avoid duplicates
    const { data: existingFiles } = await supabase
      .from('session_files')
      .select('file_id, excel_files(processing_status, storage_verified)')
      .eq('session_id', sessionId);

    const existingFileIds = new Set(existingFiles?.map(f => f.file_id) || []);

    // Filter out files that already exist
    const newFileIds = fileIds.filter(id => !existingFileIds.has(id));

    // Create new session_files entries
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

    // Verify all files are ready for processing
    await verifyFileStatus(fileIds);

    console.log('Successfully ensured session files:', fileIds);
  } catch (error) {
    console.error('Error in ensureSessionFiles:', error);
    throw error;
  }
}
