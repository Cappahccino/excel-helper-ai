
import { supabase } from "@/integrations/supabase/client";

export async function getActiveSessionFiles(sessionId: string) {
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

  return sessionFiles.map(sf => ({
    id: sf.excel_files.id,
    filename: sf.excel_files.filename,
    file_size: sf.excel_files.file_size
  }));
}

export async function updateSessionFileStatus(sessionId: string, fileId: string, isActive: boolean) {
  const { error } = await supabase
    .from('session_files')
    .upsert({
      session_id: sessionId,
      file_id: fileId,
      is_active: isActive,
      added_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error updating session file status:', error);
    throw error;
  }
}
