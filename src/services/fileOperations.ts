
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
const MAX_VERIFICATION_RETRIES = 2;

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
    // Basic check to ensure files exist
    const { data: files, error } = await supabase
      .from('excel_files')
      .select('id, filename, processing_status, storage_verified')
      .in('id', fileIds);
      
    if (error) {
      console.error('Error checking file availability:', error);
      return false;
    }
    
    if (!files || files.length === 0) {
      console.error('No files found for the provided IDs');
      return false;
    }
    
    // Identify unverified files
    const unverifiedFiles = files.filter(file => 
      !file.storage_verified || file.processing_status !== 'completed'
    );
    
    // If all files verified, return success
    if (unverifiedFiles.length === 0) {
      console.log('All files are verified and ready');
      return true;
    }
    
    // Try to verify unverified files
    const unverifiedFileIds = unverifiedFiles.map(file => file.id);
    console.log('Attempting to verify files:', unverifiedFileIds);
    
    // Quick verification attempt
    const verifyResult = await supabase.functions.invoke('verify-storage', {
      body: { fileIds: unverifiedFileIds }
    });
    
    if (verifyResult.error) {
      console.error('Error during verification:', verifyResult.error);
      // Continue anyway since some files might be valid
    }
    
    // Check if we have at least one valid file
    const { data: validFiles } = await supabase
      .from('excel_files')
      .select('id')
      .in('id', fileIds)
      .eq('storage_verified', true)
      .eq('processing_status', 'completed');
      
    const hasValidFiles = validFiles && validFiles.length > 0;
    
    if (hasValidFiles) {
      console.log(`Found ${validFiles.length} valid files out of ${fileIds.length}`);
      return true;
    } else {
      console.error('No valid files available after verification attempt');
      return false;
    }
  } catch (error) {
    console.error('Error during file validation:', error);
    return false;
  }
};

// Simple function to trigger file verification
export const triggerVerification = async (fileIds: string[]): Promise<void> => {
  if (!fileIds.length) return;
  
  try {
    console.log('Triggering verification for files:', fileIds);
    await supabase.functions.invoke('verify-storage', {
      body: { fileIds }
    });
  } catch (error) {
    console.error('Error triggering verification:', error);
    // Don't throw - let the process continue
  }
};
