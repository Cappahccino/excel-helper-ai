
import { retryOperation } from "@/utils/retryUtils";
import { getActiveSessionFiles } from "./sessionFileService";

export const getFilesWithRetry = async (sessionId: string): Promise<string[]> => {
  console.log('Attempting to get files...');
  const files = await retryOperation(async () => {
    const sessionFiles = await getActiveSessionFiles(sessionId);
    const activeFileIds = sessionFiles.map(sf => sf.file_id);
    
    if (!activeFileIds || activeFileIds.length === 0) {
      throw new Error('No files available');
    }
    
    return activeFileIds;
  });

  console.log('Found active session files:', files);
  return files;
};
