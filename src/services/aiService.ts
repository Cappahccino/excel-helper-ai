
import { supabase } from "@/integrations/supabase/client";
import { triggerVerification } from "./fileOperations";

/**
 * Trigger an AI response with simplified file handling
 */
export async function triggerAIResponse(params: {
  fileIds: string[];
  query: string;
  userId: string;
  sessionId: string;
  messageId: string;
}) {
  console.log('Triggering AI response for message:', params.messageId);
  
  try {
    if (!params.fileIds.length) {
      throw new Error('No files provided for AI processing');
    }
    
    // Single verification attempt
    console.log('Verifying files before AI processing:', params.fileIds);
    await triggerVerification(params.fileIds);
    
    // Update message status before triggering AI
    await supabase
      .from('chat_messages')
      .update({
        status: 'in_progress',
        processing_stage: {
          stage: 'generating',
          started_at: Date.now(),
          last_updated: Date.now()
        }
      })
      .eq('id', params.messageId);

    // Direct call to excel-assistant function
    console.log('Calling excel-assistant with files:', params.fileIds);
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
      
      // Update message to failed state
      await supabase
        .from('chat_messages')
        .update({
          status: 'failed',
          content: 'Failed to generate response. Please try again.',
          processing_stage: {
            stage: 'failed',
            error: aiResponse.error.message,
            last_updated: Date.now()
          }
        })
        .eq('id', params.messageId);
        
      throw aiResponse.error;
    }

    return aiResponse;
  } catch (error) {
    console.error('Error in triggerAIResponse:', error);
    
    // Ensure message is marked as failed
    try {
      await supabase
        .from('chat_messages')
        .update({
          status: 'failed',
          content: error.message || 'An error occurred during processing',
          processing_stage: {
            stage: 'failed',
            error: error.message,
            last_updated: Date.now()
          }
        })
        .eq('id', params.messageId);
    } catch (updateError) {
      console.error('Failed to update message status:', updateError);
    }
    
    throw error;
  }
}
