
import { supabase } from "@/integrations/supabase/client";

export async function getActiveSessionFiles(sessionId: string) {
  if (!sessionId) return [];
  
  const { data: sessionFiles, error } = await supabase
    .from('session_files')
    .select(`
      file_id,
      excel_files!inner (
        id,
        filename,
        file_size
      )
    `)
    .eq('session_id', sessionId)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching session files:', error);
    throw error;
  }

  // Debug log to track the retrieved files
  console.log('Retrieved active session files:', sessionFiles);

  return sessionFiles;
}
