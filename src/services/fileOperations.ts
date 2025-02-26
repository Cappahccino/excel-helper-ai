
import { retryOperation } from "@/utils/retryUtils";
import { getActiveSessionFiles } from "./sessionFileService";

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
      
      console.log('Found active session files:', activeFileIds);
      return activeFileIds;
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

export const validateFileAvailability = async (fileIds: string[]): Promise<boolean> => {
  if (!fileIds.length) return false;

  const { data, error } = await supabase
    .from('excel_files')
    .select('id, storage_verified')
    .in('id', fileIds)
    .is('deleted_at', null);

  if (error) {
    console.error('Error validating file availability:', error);
    throw error;
  }

  const allFilesAvailable = data.length === fileIds.length && 
    data.every(file => file.storage_verified);

  if (!allFilesAvailable) {
    console.warn('Some files are not available:', {
      requested: fileIds,
      available: data.map(f => f.id)
    });
  }

  return allFilesAvailable;
};
