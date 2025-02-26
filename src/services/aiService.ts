
import { supabase } from "@/integrations/supabase/client";

export async function triggerAIResponse(params: {
  fileIds: string[];
  query: string;
  userId: string;
  sessionId: string;
  messageId: string;
}) {
  console.log('Triggering AI response for message:', params.messageId);
  
  try {
    // Verify all files are processed before sending to AI
    const { data: files, error: filesError } = await supabase
      .from('excel_files')
      .select('id, processing_status, storage_verified')
      .in('id', params.fileIds);

    if (filesError) throw filesError;

    const unprocessedFiles = files?.filter(f => 
      !f.storage_verified || f.processing_status !== 'completed'
    );

    if (unprocessedFiles?.length) {
      console.log('Waiting for files to be processed:', unprocessedFiles);
      // Trigger verification for unprocessed files
      await supabase.functions.invoke('verify-storage', {
        body: { fileIds: unprocessedFiles.map(f => f.id) }
      });

      // Small delay to allow verification to start
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const aiResponse = await supabase.functions.invoke('excel-assistant', {
      body: {
        fileIds: params.fileIds,
        query: params.query,
        userId: params.userId,
        sessionId: params.sessionId,
        threadId: null,
        messageId: params.messageId,
        action: 'query'
      }
    });

    if (aiResponse.error) {
      console.error('Error triggering AI response:', aiResponse.error);
      throw aiResponse.error;
    }

    return aiResponse;
  } catch (error) {
    console.error('Error in triggerAIResponse:', error);
    throw error;
  }
}
