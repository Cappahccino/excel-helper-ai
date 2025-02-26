
import { supabase } from "@/integrations/supabase/client";

interface SessionFile {
  file_id: string;
  excel_files: {
    id: string;
    filename: string;
    file_size: number;
    processing_status: string;
    storage_verified: boolean;
  } | null;
}

export async function getActiveSessionFiles(sessionId: string) {
  if (!sessionId) {
    console.log('No session ID provided');
    return [];
  }
  
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
        storage_verified,
        file_path,
        deleted_at
      )
    `)
    .eq('session_id', sessionId)
    .eq('is_active', true)
    .is('excel_files.deleted_at', null);

  if (error) {
    console.error('Error fetching session files:', error);
    throw error;
  }

  // Filter out files that aren't ready
  const validFiles = sessionFiles?.filter(sf => 
    sf.excel_files?.processing_status === 'completed' && 
    sf.excel_files?.storage_verified === true
  );

  console.log('Retrieved active session files:', {
    total: sessionFiles?.length || 0,
    valid: validFiles?.length || 0,
    invalidFiles: sessionFiles?.filter(sf => 
      !validFiles?.find(vf => vf.file_id === sf.file_id)
    ).map(sf => ({
      fileId: sf.file_id,
      status: sf.excel_files?.processing_status,
      verified: sf.excel_files?.storage_verified
    }))
  });

  return validFiles as SessionFile[];
}

export async function verifyFileAssociations(sessionId: string, fileIds: string[]) {
  try {
    console.log('Verifying file associations for session:', sessionId, 'files:', fileIds);

    // First, verify the files exist and are properly processed
    const { data: existingFiles, error: filesError } = await supabase
      .from('excel_files')
      .select(`
        id,
        processing_status,
        storage_verified,
        file_metadata(id)
      `)
      .in('id', fileIds)
      .is('deleted_at', null);

    if (filesError) {
      console.error('Error checking file existence:', filesError);
      throw filesError;
    }

    if (!existingFiles || existingFiles.length !== fileIds.length) {
      const foundIds = existingFiles?.map(f => f.id) || [];
      const missingIds = fileIds.filter(id => !foundIds.includes(id));
      console.error('Missing files:', missingIds);
      throw new Error(`Files not found: ${missingIds.join(', ')}`);
    }

    // Verify file status
    const invalidFiles = existingFiles.filter(f => 
      f.processing_status !== 'completed' || 
      !f.storage_verified ||
      !f.file_metadata
    );

    if (invalidFiles.length > 0) {
      console.error('Invalid files:', invalidFiles);
      throw new Error(
        `Some files are not ready: ${invalidFiles.map(f => 
          `${f.id} (status: ${f.processing_status}, verified: ${f.storage_verified})`
        ).join(', ')}`
      );
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
        { 
          onConflict: 'session_id,file_id',
          ignoreDuplicates: false 
        }
      );

    if (sessionError) {
      console.error('Error upserting session files:', sessionError);
      throw sessionError;
    }

    // Verify the associations were created
    const { data: verifiedAssociations, error: verifyError } = await supabase
      .from('session_files')
      .select('file_id')
      .eq('session_id', sessionId)
      .in('file_id', fileIds);

    if (verifyError) {
      console.error('Error verifying associations:', verifyError);
      throw verifyError;
    }

    if (!verifiedAssociations || verifiedAssociations.length !== fileIds.length) {
      console.error('Not all associations were created:', {
        expected: fileIds.length,
        created: verifiedAssociations?.length || 0
      });
      throw new Error('Failed to create all file associations');
    }

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

    // First verify the files exist
    const { data: existingFiles, error: checkError } = await supabase
      .from('session_files')
      .select('file_id')
      .eq('session_id', sessionId)
      .in('file_id', fileIds);

    if (checkError) {
      console.error('Error checking file existence:', checkError);
      throw checkError;
    }

    if (!existingFiles || existingFiles.length !== fileIds.length) {
      console.error('Some files not found in session');
      throw new Error('Some files are not associated with this session');
    }

    // Update file activation status
    const { error: updateError } = await supabase
      .from('session_files')
      .update({ is_active: active })
      .eq('session_id', sessionId)
      .in('file_id', fileIds);

    if (updateError) {
      console.error('Error updating file activation:', updateError);
      throw updateError;
    }

    // Verify the update was successful
    const { data: verifiedUpdate, error: verifyError } = await supabase
      .from('session_files')
      .select('file_id, is_active')
      .eq('session_id', sessionId)
      .in('file_id', fileIds)
      .eq('is_active', active);

    if (verifyError) {
      console.error('Error verifying update:', verifyError);
      throw verifyError;
    }

    if (!verifiedUpdate || verifiedUpdate.length !== fileIds.length) {
      console.error('Not all files were updated:', {
        expected: fileIds.length,
        updated: verifiedUpdate?.length || 0
      });
      throw new Error('Failed to update all file activations');
    }

    console.log('File activation updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating file activation:', error);
    throw error;
  }
}
