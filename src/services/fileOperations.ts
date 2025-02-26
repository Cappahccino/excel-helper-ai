
import { retryOperation } from "@/utils/retryUtils";
import { getActiveSessionFiles } from "./sessionFileService";
import { supabase } from "@/integrations/supabase/client";

interface ValidationResult {
  success: boolean;
  fileId: string;
  errors: string[];
}

export const getFilesWithRetry = async (sessionId: string): Promise<string[]> => {
  console.log('Attempting to get files for session:', sessionId);
  
  try {
    const files = await retryOperation(async () => {
      const sessionFiles = await getActiveSessionFiles(sessionId);
      const activeFileIds = sessionFiles.map(sf => sf.file_id);
      
      if (!activeFileIds || activeFileIds.length === 0) {
        console.error('No active files found for session:', sessionId);
        throw new Error('No files available');
      }
      
      // Validate each file's status with more detailed logging
      console.log('Validating files:', activeFileIds);
      const validationResults = await Promise.all(
        activeFileIds.map(validateFileStatus)
      );

      const validFiles = validationResults
        .filter(result => result.success)
        .map(result => result.fileId);

      if (validFiles.length === 0) {
        const errors = validationResults
          .flatMap(result => result.errors)
          .join(', ');
        console.error('No valid files after validation:', errors);
        throw new Error(`No valid files available: ${errors}`);
      }
      
      console.log('Found valid session files:', validFiles);
      return validFiles;
    }, {
      maxRetries: 3,
      delay: 1000,
      backoff: 2,
      onRetry: (error, attempt) => {
        console.warn(`Retry attempt ${attempt} for session ${sessionId}:`, error.message);
      }
    });

    return files;
  } catch (error) {
    console.error('Final error getting files for session:', sessionId, error);
    throw new Error('Failed to retrieve files after multiple attempts');
  }
};

const validateFileStatus = async (fileId: string): Promise<ValidationResult> => {
  console.log('Validating file:', fileId);
  const errors: string[] = [];

  try {
    // Check file exists and is properly processed
    const { data: file, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .is('deleted_at', null)
      .single();

    if (fileError || !file) {
      console.error('File not found or deleted:', fileId);
      errors.push(`File ${fileId} not found or deleted`);
      return { success: false, fileId, errors };
    }

    console.log('File status:', fileId, {
      storage_verified: file.storage_verified,
      processing_status: file.processing_status
    });

    // Check storage verification and processing status
    if (!file.storage_verified) {
      errors.push(`File ${fileId} not verified in storage`);
    }

    if (file.processing_status !== 'completed') {
      errors.push(`File ${fileId} processing not complete (status: ${file.processing_status})`);
    }

    // Check file metadata exists
    const { data: metadata, error: metadataError } = await supabase
      .from('file_metadata')
      .select('id')
      .eq('file_id', fileId)
      .single();

    if (metadataError || !metadata) {
      errors.push(`File ${fileId} metadata not generated`);
    }

    // Verify storage accessibility
    const { data: storageData, error: storageError } = await supabase
      .storage
      .from('excel_files')
      .download(file.file_path);

    if (storageError) {
      console.error('Storage access error for file:', fileId, storageError);
      errors.push(`File ${fileId} not accessible in storage`);
    }

    const result = {
      success: errors.length === 0,
      fileId,
      errors
    };

    console.log('Validation result for file:', fileId, result);
    return result;
  } catch (error) {
    console.error('Unexpected error validating file:', fileId, error);
    errors.push(`Unexpected error validating file ${fileId}: ${error.message}`);
    return {
      success: false,
      fileId,
      errors
    };
  }
};

export const validateFileAvailability = async (fileIds: string[]): Promise<boolean> => {
  if (!fileIds.length) return false;

  const validationResults = await Promise.all(
    fileIds.map(validateFileStatus)
  );

  const allFilesValid = validationResults.every(result => result.success);

  if (!allFilesValid) {
    console.warn('File validation failed:', 
      validationResults
        .filter(result => !result.success)
        .map(result => ({
          fileId: result.fileId,
          errors: result.errors
        }))
    );
  }

  return allFilesValid;
};

