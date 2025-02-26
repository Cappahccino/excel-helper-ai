
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
  
  // Using LEFT JOIN instead of INNER JOIN to get all files
  const { data: sessionFiles, error } = await supabase
    .from('session_files')
    .select(`
      file_id,
      excel_files (
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
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching session files:', error);
    throw error;
  }

  // Improved file validation with detailed logging
  const validFiles = sessionFiles?.filter(sf => {
    const isValid = sf.excel_files && 
                   !sf.excel_files.deleted_at &&
                   sf.excel_files.processing_status === 'completed' && 
                   sf.excel_files.storage_verified === true;

    if (!isValid) {
      console.log('Invalid file detected:', {
        fileId: sf.file_id,
        exists: !!sf.excel_files,
        isDeleted: sf.excel_files?.deleted_at ? 'yes' : 'no',
        status: sf.excel_files?.processing_status,
        verified: sf.excel_files?.storage_verified
      });
    }

    return isValid;
  });

  console.log('File validation results:', {
    total: sessionFiles?.length || 0,
    valid: validFiles?.length || 0,
    invalidCount: (sessionFiles?.length || 0) - (validFiles?.length || 0)
  });

  return validFiles as SessionFile[];
}

export async function verifyFileAssociations(sessionId: string, fileIds: string[]) {
  try {
    console.log('Verifying file associations for session:', sessionId, 'files:', fileIds);

    // Check files in batches to avoid timeout issues with large sets
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < fileIds.length; i += batchSize) {
      batches.push(fileIds.slice(i, i + batchSize));
    }

    const verificationResults = await Promise.all(
      batches.map(async (batchFileIds) => {
        const { data: existingFiles, error: filesError } = await supabase
          .from('excel_files')
          .select(`
            id,
            processing_status,
            storage_verified,
            file_metadata(id)
          `)
          .in('id', batchFileIds)
          .is('deleted_at', null);

        if (filesError) {
          console.error('Error checking batch files:', filesError);
          throw filesError;
        }

        return existingFiles || [];
      })
    );

    // Combine all verification results
    const existingFiles = verificationResults.flat();
    
    // Check for missing files
    const foundIds = new Set(existingFiles.map(f => f.id));
    const missingIds = fileIds.filter(id => !foundIds.has(id));
    
    if (missingIds.length > 0) {
      console.error('Missing files:', missingIds);
      throw new Error(`Files not found: ${missingIds.join(', ')}`);
    }

    // Validate file statuses with partial success handling
    const fileStatuses = existingFiles.map(file => ({
      id: file.id,
      isValid: file.processing_status === 'completed' && 
               file.storage_verified === true &&
               file.file_metadata !== null,
      status: file.processing_status,
      verified: file.storage_verified,
      hasMetadata: file.file_metadata !== null
    }));

    const invalidFiles = fileStatuses.filter(f => !f.isValid);
    
    if (invalidFiles.length > 0) {
      console.error('Invalid files:', invalidFiles);
      throw new Error(
        `Some files are not ready: ${invalidFiles.map(f => 
          `${f.id} (status: ${f.status}, verified: ${f.verified}, metadata: ${f.hasMetadata})`
        ).join(', ')}`
      );
    }

    // Create or update session_files entries in batches
    for (const batch of batches) {
      const { error: sessionError } = await supabase
        .from('session_files')
        .upsert(
          batch.map(fileId => ({
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
        console.error('Error upserting session files batch:', sessionError);
        throw sessionError;
      }
    }

    // Final verification of all associations
    const { data: verifiedAssociations, error: verifyError } = await supabase
      .from('session_files')
      .select('file_id')
      .eq('session_id', sessionId)
      .in('file_id', fileIds);

    if (verifyError) {
      console.error('Error in final verification:', verifyError);
      throw verifyError;
    }

    const verifiedIds = new Set(verifiedAssociations?.map(v => v.file_id) || []);
    const unverifiedIds = fileIds.filter(id => !verifiedIds.has(id));

    if (unverifiedIds.length > 0) {
      console.error('Some file associations failed verification:', unverifiedIds);
      throw new Error(`Failed to verify associations for files: ${unverifiedIds.join(', ')}`);
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

    // Process files in batches
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < fileIds.length; i += batchSize) {
      batches.push(fileIds.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      // Verify existence
      const { data: existingFiles, error: checkError } = await supabase
        .from('session_files')
        .select('file_id')
        .eq('session_id', sessionId)
        .in('file_id', batch);

      if (checkError) {
        console.error('Error checking file existence:', checkError);
        throw checkError;
      }

      const foundIds = new Set(existingFiles?.map(f => f.file_id) || []);
      const missingIds = batch.filter(id => !foundIds.has(id));

      if (missingIds.length > 0) {
        console.error('Files not found in session:', missingIds);
        throw new Error(`Files not associated with session: ${missingIds.join(', ')}`);
      }

      // Update activation status
      const { error: updateError } = await supabase
        .from('session_files')
        .update({ is_active: active })
        .eq('session_id', sessionId)
        .in('file_id', batch);

      if (updateError) {
        console.error('Error updating file activation:', updateError);
        throw updateError;
      }
    }

    // Final verification
    const { data: verifiedUpdate, error: verifyError } = await supabase
      .from('session_files')
      .select('file_id, is_active')
      .eq('session_id', sessionId)
      .in('file_id', fileIds)
      .eq('is_active', active);

    if (verifyError) {
      console.error('Error in final verification:', verifyError);
      throw verifyError;
    }

    const verifiedIds = new Set(verifiedUpdate?.map(v => v.file_id) || []);
    const unverifiedIds = fileIds.filter(id => !verifiedIds.has(id));

    if (unverifiedIds.length > 0) {
      console.error('Some files failed activation update:', unverifiedIds);
      throw new Error(`Failed to update activation for files: ${unverifiedIds.join(', ')}`);
    }

    console.log('File activation updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating file activation:', error);
    throw error;
  }
}
