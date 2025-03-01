
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

const PROCESSING_CHECK_INTERVAL = 1000; // 1 second
const MAX_VERIFICATION_RETRIES = 3; // Increased from 2
const MAX_WAIT_TIME_MS = 10000; // 10 seconds maximum wait time

export const getFilesWithRetry = async (sessionId: string): Promise<string[]> => {
  console.log('Attempting to get files for session:', sessionId);
  
  try {
    const sessionFiles = await getActiveSessionFiles(sessionId);
    if (!sessionFiles || sessionFiles.length === 0) {
      console.error('No active files found for session:', sessionId);
      throw new Error('No files available');
    }

    const activeFileIds = sessionFiles.map(sf => sf.file_id);
    console.log('Found active file IDs:', activeFileIds);
    
    // Return active file IDs directly - simplified approach
    return activeFileIds;
  } catch (error) {
    console.error('Error getting files for session:', sessionId, error);
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
    // Enhanced check with retries
    for (let attempt = 1; attempt <= MAX_VERIFICATION_RETRIES; attempt++) {
      console.log(`File validation attempt ${attempt}/${MAX_VERIFICATION_RETRIES}`);
      
      // Check file existence and status - fixed the query to select file_metadata as a separate relation
      const { data: files, error } = await supabase
        .from('excel_files')
        .select(`
          id, 
          filename, 
          processing_status, 
          storage_verified,
          file_metadata (id)
        `)
        .in('id', fileIds);
        
      if (error) {
        console.error('Error checking file availability:', error);
        if (attempt === MAX_VERIFICATION_RETRIES) return false;
        await wait(PROCESSING_CHECK_INTERVAL);
        continue;
      }
      
      if (!files || files.length === 0) {
        console.error('No files found for the provided IDs');
        if (attempt === MAX_VERIFICATION_RETRIES) return false;
        await wait(PROCESSING_CHECK_INTERVAL);
        continue;
      }
      
      // Check if all files are ready
      const unverifiedFiles = files.filter(file => 
        !file.storage_verified || 
        file.processing_status !== 'completed' ||
        !file.file_metadata
      );
      
      // If all files verified, return success
      if (unverifiedFiles.length === 0) {
        console.log('All files are verified and ready');
        return true;
      }
      
      console.log(`Found ${unverifiedFiles.length} unverified files:`, 
        unverifiedFiles.map(f => ({
          id: f.id, 
          status: f.processing_status, 
          verified: f.storage_verified,
          hasMetadata: !!f.file_metadata
        }))
      );
      
      // Try to verify unverified files
      const unverifiedFileIds = unverifiedFiles.map(file => file.id);
      console.log('Attempting to verify files:', unverifiedFileIds);
      
      const verifyResult = await supabase.functions.invoke('verify-storage', {
        body: { fileIds: unverifiedFileIds }
      });
      
      if (verifyResult.error) {
        console.error('Error during verification:', verifyResult.error);
      } else {
        console.log('Verification request successful');
      }
      
      // Wait for files to be processed
      if (attempt < MAX_VERIFICATION_RETRIES) {
        console.log(`Waiting ${PROCESSING_CHECK_INTERVAL}ms before checking again...`);
        await wait(PROCESSING_CHECK_INTERVAL);
      }
    }
    
    // Final check after all retries
    const { data: validFiles } = await supabase
      .from('excel_files')
      .select('id')
      .in('id', fileIds)
      .eq('storage_verified', true)
      .eq('processing_status', 'completed');
      
    const hasValidFiles = validFiles && validFiles.length > 0;
    
    if (hasValidFiles) {
      console.log(`Final check: Found ${validFiles.length} valid files out of ${fileIds.length}`);
      return validFiles.length === fileIds.length; // Only return true if ALL files are valid
    } else {
      console.error('No valid files available after maximum verification attempts');
      return false;
    }
  } catch (error) {
    console.error('Error during file validation:', error);
    return false;
  }
};

// Enhanced verification function with detailed logging and retries
export const triggerVerification = async (fileIds: string[]): Promise<boolean> => {
  if (!fileIds.length) return false;
  
  try {
    console.log('Triggering enhanced verification for files:', fileIds);
    
    // Initial verification request
    const verifyResponse = await supabase.functions.invoke('verify-storage', {
      body: { 
        fileIds,
        forceRefresh: true,
        detailed: true 
      }
    });
    
    if (verifyResponse.error) {
      console.error('Error in verification request:', verifyResponse.error);
      throw new Error(`Verification failed: ${verifyResponse.error.message}`);
    }
    
    console.log('Verification triggered successfully');
    
    // Wait for verification to complete with timeout
    const startTime = Date.now();
    let allVerified = false;
    
    while (Date.now() - startTime < MAX_WAIT_TIME_MS) {
      console.log('Checking file verification status...');
      
      const { data: files, error } = await supabase
        .from('excel_files')
        .select('id, processing_status, storage_verified')
        .in('id', fileIds);
        
      if (error) {
        console.error('Error checking verification status:', error);
        await wait(PROCESSING_CHECK_INTERVAL);
        continue;
      }
      
      if (!files || files.length < fileIds.length) {
        console.warn(`Only found ${files?.length || 0} of ${fileIds.length} files`);
        await wait(PROCESSING_CHECK_INTERVAL);
        continue;
      }
      
      const pendingFiles = files.filter(f => 
        f.processing_status !== 'completed' || !f.storage_verified
      );
      
      if (pendingFiles.length === 0) {
        console.log('All files successfully verified');
        allVerified = true;
        break;
      }
      
      console.log(`Waiting for ${pendingFiles.length} files to complete verification:`, 
        pendingFiles.map(f => ({ id: f.id, status: f.processing_status, verified: f.storage_verified }))
      );
      
      await wait(PROCESSING_CHECK_INTERVAL);
    }
    
    return allVerified;
  } catch (error) {
    console.error('Error in enhanced verification process:', error);
    return false;
  }
};
