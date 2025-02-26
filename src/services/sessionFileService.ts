
import { supabase } from "@/integrations/supabase/client";

interface SessionFile {
  file_id: string;
  excel_files: {
    id: string;
    filename: string;
    file_size: number;
  } | null;
}

export async function getActiveSessionFiles(sessionId: string) {
  if (!sessionId) return [];
  
  console.log('Fetching active session files for session:', sessionId);
  
  const { data: sessionFiles, error } = await supabase
    .from('session_files')
    .select(`
      file_id,
      excel_files!inner (
        id,
        filename,
        file_size,
        processing_status,
        storage_verified
      )
    `)
    .eq('session_id', sessionId)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching session files:', error);
    throw error;
  }

  // Filter out files that aren't ready
  const validFiles = sessionFiles?.filter(sf => 
    sf.excel_files?.processing_status === 'completed' && 
    sf.excel_files?.storage_verified === true
  );

  // Debug log to track the retrieved files
  console.log('Retrieved active session files:', validFiles);

  return validFiles as SessionFile[];
}

export async function verifyFileAssociations(sessionId: string, fileIds: string[]) {
  try {
    console.log('Verifying file associations for session:', sessionId, 'files:', fileIds);

    // First, verify the files exist and are properly processed
    const { data: existingFiles, error: filesError } = await supabase
      .from('excel_files')
      .select('id, processing_status, storage_verified')
      .in('id', fileIds)
      .is('deleted_at', null)
      .eq('storage_verified', true)
      .eq('processing_status', 'completed');

    if (filesError) throw filesError;

    if (!existingFiles || existingFiles.length !== fileIds.length) {
      const foundIds = existingFiles?.map(f => f.id) || [];
      const missingIds = fileIds.filter(id => !foundIds.includes(id));
      throw new Error(`Some files are not available or not properly processed: ${missingIds.join(', ')}`);
    }

    // Then, verify or create session_files entries
    const { error: sessionError } = await supabase
      .from('session_files')
      .upsert(
        fileIds.map(fileId => ({
          session_id: sessionId,
          file_id: fileId,
          is_active: true
        })),
        { onConflict: 'session_id,file_id' }
      );

    if (sessionError) throw sessionError;

    console.log('File associations verified successfully');
    return true;
  } catch (error) {
    console.error('Error verifying file associations:', error);
    throw error;
  }
}

export async function updateFileActivation(sessionId: string, fileIds: string[], active: boolean) {
  try {
    console.log(`${active ? 'Activating' : 'Deactivating'} files for session:`, sessionId, 'files:', fileIds);

    const { error } = await supabase
      .from('session_files')
      .update({ is_active: active })
      .eq('session_id', sessionId)
      .in('file_id', fileIds);

    if (error) throw error;

    console.log('File activation updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating file activation:', error);
    throw error;
  }
}
