
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
      if (!sessionFiles || sessionFiles.length === 0) {
        console.error('No active files found for session:', sessionId);
        throw new Error('No files available');
      }

      const activeFileIds = sessionFiles.map(sf => sf.file_id);
      console.log('Found active file IDs:', activeFileIds);
      
      // Validate each file's status with more detailed logging
      console.log('Starting validation for files:', activeFileIds);
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
      
      console.log('Successfully validated files:', validFiles);
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
    throw error;
  }
};

const validateFileStatus = async (fileId: string): Promise<ValidationResult> => {
  console.log('Starting validation for file:', fileId);
  const errors: string[] = [];

  try {
    // Check if file exists and is properly processed
    const { data: file, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .is('deleted_at', null)
      .maybeSingle();

    if (fileError) {
      console.error('Database error checking file:', fileId, fileError);
      errors.push(`Database error: ${fileError.message}`);
      return { success: false, fileId, errors };
    }

    if (!file) {
      console.error('File not found:', fileId);
      errors.push(`File ${fileId} not found or deleted`);
      return { success: false, fileId, errors };
    }

    console.log('File status check:', fileId, {
      storage_verified: file.storage_verified,
      processing_status: file.processing_status
    });

    // Validate storage verification
    if (!file.storage_verified) {
      errors.push(`File ${fileId} not verified in storage`);
    }

    // Validate processing status
    if (file.processing_status !== 'completed') {
      errors.push(`File ${fileId} processing not complete (status: ${file.processing_status})`);
    }

    // Check file metadata exists
    const { data: metadata, error: metadataError } = await supabase
      .from('file_metadata')
      .select('id')
      .eq('file_id', fileId)
      .maybeSingle();

    if (metadataError) {
      console.error('Metadata check error:', fileId, metadataError);
      errors.push(`Metadata check error: ${metadataError.message}`);
    } else if (!metadata) {
      errors.push(`File ${fileId} metadata not generated`);
    }

    // Verify storage accessibility
    const { data: storageData, error: storageError } = await supabase
      .storage
      .from('excel_files')
      .download(file.file_path);

    if (storageError) {
      console.error('Storage access error:', fileId, storageError);
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
  if (!fileIds.length) {
    console.error('No file IDs provided for validation');
    return false;
  }

  console.log('Validating availability for files:', fileIds);

  try {
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
    } else {
      console.log('All files validated successfully');
    }

    return allFilesValid;
  } catch (error) {
    console.error('Error during file validation:', error);
    return false;
  }
};
