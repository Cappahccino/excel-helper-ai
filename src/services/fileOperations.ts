
import { retryOperation } from "@/utils/retryUtils";
import { getActiveSessionFiles } from "./sessionFileService";
import { supabase } from "@/integrations/supabase/client";
import { wait } from "@/utils/retryUtils";

interface ValidationResult {
  success: boolean;
  fileId: string;
  errors: string[];
  file?: any;  // Store the file data for reuse
}

const MAX_PROCESSING_WAIT_TIME = 30000; // 30 seconds
const PROCESSING_CHECK_INTERVAL = 1000; // 1 second

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
      
      // Wait for files to be processed with timeout
      const processingPromises = activeFileIds.map(waitForFileProcessing);
      const processedFiles = await Promise.all(processingPromises);
      
      // Filter out any files that failed processing
      const validFiles = processedFiles
        .filter(result => result.success)
        .map(result => result.fileId);

      if (validFiles.length === 0) {
        throw new Error('No valid files available after processing');
      }
      
      console.log('Successfully validated files:', validFiles);
      return validFiles;
    }, {
      maxRetries: 5,  // Increased retries
      delay: 2000,    // Longer initial delay
      backoff: 1.5,   // Gentler backoff
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

const waitForFileProcessing = async (fileId: string): Promise<ValidationResult> => {
  const startTime = Date.now();
  let lastStatus = '';
  
  while (Date.now() - startTime < MAX_PROCESSING_WAIT_TIME) {
    const result = await validateFileStatus(fileId);
    
    // If validation succeeds, return immediately
    if (result.success) {
      return result;
    }

    // Check if the status has changed
    const currentStatus = result.file?.processing_status;
    if (currentStatus && currentStatus !== lastStatus) {
      console.log(`File ${fileId} processing status changed to:`, currentStatus);
      lastStatus = currentStatus;
    }

    // If file is still processing, wait and retry
    if (result.file && ['pending', 'processing'].includes(result.file.processing_status)) {
      await wait(PROCESSING_CHECK_INTERVAL);
      continue;
    }

    // If file failed processing or is in an invalid state, return the error
    if (result.file?.processing_status === 'failed') {
      return result;
    }
  }

  return {
    success: false,
    fileId,
    errors: [`File processing timed out after ${MAX_PROCESSING_WAIT_TIME}ms`]
  };
};

const validateFileStatus = async (fileId: string): Promise<ValidationResult> => {
  console.log('Validating file status:', fileId);
  const errors: string[] = [];

  try {
    // Check if file exists and get its status
    const { data: file, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .is('deleted_at', null)
      .maybeSingle();

    if (fileError) {
      console.error('Database error checking file:', fileId, fileError);
      return { 
        success: false, 
        fileId, 
        errors: [`Database error: ${fileError.message}`] 
      };
    }

    if (!file) {
      console.error('File not found:', fileId);
      return { 
        success: false, 
        fileId, 
        errors: [`File ${fileId} not found or deleted`] 
      };
    }

    // Store validation state
    const validationState = {
      success: true,
      fileId,
      errors: [] as string[],
      file
    };

    // Progressive validation - check each aspect separately
    // 1. Basic file existence (already checked above)
    // 2. Processing status
    if (file.processing_status === 'failed') {
      validationState.errors.push(`File ${fileId} processing failed`);
      validationState.success = false;
    } else if (file.processing_status === 'completed') {
      // For completed files, perform full validation
      if (!file.storage_verified) {
        validationState.errors.push(`File ${fileId} not verified in storage`);
        validationState.success = false;
      }

      // Check metadata only for completed files
      const { data: metadata, error: metadataError } = await supabase
        .from('file_metadata')
        .select('id')
        .eq('file_id', fileId)
        .maybeSingle();

      if (metadataError) {
        console.warn('Metadata check warning:', fileId, metadataError);
        // Don't fail validation for metadata issues
      } else if (!metadata) {
        console.warn(`File ${fileId} metadata not generated yet`);
        // Don't fail validation for missing metadata
      }

      // Verify storage accessibility for completed files
      if (file.storage_verified) {
        const { data: storageData, error: storageError } = await supabase
          .storage
          .from('excel_files')
          .download(file.file_path);

        if (storageError) {
          console.error('Storage access error:', fileId, storageError);
          validationState.errors.push(`File ${fileId} not accessible in storage`);
          validationState.success = false;
        }
      }
    }

    console.log('Validation result for file:', fileId, validationState);
    return validationState;
  } catch (error) {
    console.error('Unexpected error validating file:', fileId, error);
    return {
      success: false,
      fileId,
      errors: [`Unexpected error: ${error.message}`]
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
    const validationPromises = fileIds.map(fileId => 
      waitForFileProcessing(fileId)
        .then(result => ({ fileId, ...result }))
    );

    const results = await Promise.all(validationPromises);
    
    // Consider validation successful if at least one file is valid
    const validFiles = results.filter(result => result.success);
    
    if (validFiles.length === 0) {
      console.error('No valid files found after validation:', 
        results.map(r => ({
          fileId: r.fileId,
          errors: r.errors
        }))
      );
      return false;
    }

    // Log warning if some files failed validation
    if (validFiles.length < fileIds.length) {
      console.warn(`${fileIds.length - validFiles.length} files failed validation:`,
        results
          .filter(r => !r.success)
          .map(r => ({
            fileId: r.fileId,
            errors: r.errors
          }))
      );
    }

    return true;
  } catch (error) {
    console.error('Error during file validation:', error);
    return false;
  }
};
