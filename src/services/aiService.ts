
import { supabase } from "@/integrations/supabase/client";

/**
 * Maximum number of verification attempts
 */
const MAX_VERIFICATION_ATTEMPTS = 3;

/**
 * Delay between verification attempts in milliseconds
 */
const VERIFICATION_RETRY_DELAY = 2000;

/**
 * Verify files are ready for AI processing
 * @param fileIds Array of file IDs to verify
 * @returns Promise resolving to an array of verified file IDs
 */
async function verifyFiles(fileIds: string[]): Promise<string[]> {
  console.log('Verifying files for AI processing:', fileIds);
  
  try {
    // Get file status
    const { data: files, error: filesError } = await supabase
      .from('excel_files')
      .select('id, processing_status, storage_verified')
      .in('id', fileIds);

    if (filesError) throw filesError;

    // Check if all files are verified and processed
    const allFilesReady = files?.every(f => 
      f.storage_verified === true && f.processing_status === 'completed'
    );
    
    if (allFilesReady) {
      console.log('All files are verified and ready');
      return fileIds;
    }

    // Identify files needing verification
    const unverifiedFiles = files?.filter(f => 
      !f.storage_verified || f.processing_status !== 'completed'
    ).map(f => f.id) || [];
    
    if (unverifiedFiles.length === 0) {
      console.log('No files need verification');
      return fileIds;
    }

    console.log('Files needing verification:', unverifiedFiles);
    
    // Trigger file verification
    const { data: verificationResult, error: verificationError } = await supabase.functions.invoke('verify-storage', {
      body: { fileIds: unverifiedFiles }
    });

    if (verificationError) {
      console.error('Error during file verification:', verificationError);
      throw verificationError;
    }

    console.log('Verification completed:', verificationResult);
    
    // Filter to only include verified files
    const verifiedFileIds = verificationResult?.verified
      ?.filter(result => result.verified)
      ?.map(result => result.id) || [];
      
    if (verifiedFileIds.length !== fileIds.length) {
      console.warn('Some files could not be verified:', 
        verificationResult?.verified
          ?.filter(result => !result.verified)
          ?.map(result => `${result.id}: ${result.error || 'Unknown error'}`)
      );
    }
    
    return verifiedFileIds.length > 0 ? verifiedFileIds : fileIds;
  } catch (error) {
    console.error('Error in verifyFiles:', error);
    // Return original fileIds on error to not block the flow
    return fileIds;
  }
}

/**
 * Trigger an AI response with retry logic for file verification
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
    // Initialize attempt counter
    let verificationAttempts = 0;
    let verifiedFileIds = [...params.fileIds];
    
    // Try verification up to MAX_VERIFICATION_ATTEMPTS times
    while (verificationAttempts < MAX_VERIFICATION_ATTEMPTS) {
      verificationAttempts++;
      console.log(`Verification attempt ${verificationAttempts}/${MAX_VERIFICATION_ATTEMPTS}`);
      
      verifiedFileIds = await verifyFiles(params.fileIds);
      
      // If we have verified files, break the loop
      if (verifiedFileIds.length > 0) {
        console.log(`Successfully verified ${verifiedFileIds.length} files after ${verificationAttempts} attempts`);
        break;
      }
      
      // If maximum attempts reached, exit the loop
      if (verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
        console.error('Maximum file verification attempts reached without success');
        break;
      }
      
      // Wait before retrying
      console.log(`Waiting ${VERIFICATION_RETRY_DELAY}ms before next verification attempt`);
      await new Promise(resolve => setTimeout(resolve, VERIFICATION_RETRY_DELAY));
    }

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

    // Call excel-assistant with verified file IDs
    console.log('Calling excel-assistant with files:', verifiedFileIds);
    const aiResponse = await supabase.functions.invoke('excel-assistant', {
      body: {
        fileIds: verifiedFileIds,
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
