
import { retryOperation } from "@/utils/retryUtils";
import { getActiveSessionFiles } from "./sessionFileService";
import { supabase } from "@/integrations/supabase/client";
import { wait } from "@/utils/retryUtils";

interface ValidationResult {
  success: boolean;
  fileId: string;
  errors: string[];
  file?: any;
}

type ProcessingStatus = 'pending' | 'verifying' | 'processing' | 'analyzing' | 'completed' | 'error';

const MAX_PROCESSING_WAIT_TIME = 30000; // 30 seconds
const PROCESSING_CHECK_INTERVAL = 1000; // 1 second
const MAX_VERIFICATION_RETRIES = 5;

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
      
      // Enhanced verification: Wait for files to be processed with status tracking
      const processingPromises = activeFileIds.map(monitorFileProcessing);
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
      maxRetries: MAX_VERIFICATION_RETRIES,
      delay: 2000,
      backoff: 1.5,
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

const monitorFileProcessing = async (fileId: string): Promise<ValidationResult> => {
  const startTime = Date.now();
  let lastStatus: ProcessingStatus | null = null;
  
  while (Date.now() - startTime < MAX_PROCESSING_WAIT_TIME) {
    const result = await checkFileStatus(fileId);
    
    // If validation succeeds, return immediately
    if (result.success) {
      return result;
    }

    // If the status has changed, trigger appropriate actions
    if (result.file?.processing_status !== lastStatus) {
      console.log(`File ${fileId} status changed to:`, result.file?.processing_status);
      lastStatus = result.file?.processing_status;

      // Trigger verification if needed
      if (result.file?.processing_status === 'pending') {
        await triggerVerification(fileId);
      }
    }

    // If file is in a terminal state (completed or error), return the result
    if (result.file?.processing_status === 'completed' || result.file?.processing_status === 'error') {
      return result;
    }

    // Wait before next check
    await wait(PROCESSING_CHECK_INTERVAL);
  }

  return {
    success: false,
    fileId,
    errors: [`File processing timed out after ${MAX_PROCESSING_WAIT_TIME}ms`]
  };
};

const checkFileStatus = async (fileId: string): Promise<ValidationResult> => {
  try {
    const { data: file, error } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (error) throw error;

    if (!file) {
      return {
        success: false,
        fileId,
        errors: ['File not found'],
      };
    }

    // Validate file state
    const isValid = file.storage_verified && 
                   file.processing_status === 'completed' &&
                   !file.deleted_at;

    return {
      success: isValid,
      fileId,
      errors: isValid ? [] : [`File status: ${file.processing_status}, verified: ${file.storage_verified}`],
      file
    };
  } catch (error) {
    console.error('Error checking file status:', error);
    return {
      success: false,
      fileId,
      errors: [error.message]
    };
  }
};

const triggerVerification = async (fileId: string): Promise<void> => {
  try {
    console.log('Triggering verification for file:', fileId);
    const { error } = await supabase.functions.invoke('verify-storage', {
      body: { fileIds: [fileId] }
    });

    if (error) {
      console.error('Error triggering verification:', error);
      throw error;
    }
  } catch (error) {
    console.error('Failed to trigger verification:', error);
    throw error;
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
      monitorFileProcessing(fileId)
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
