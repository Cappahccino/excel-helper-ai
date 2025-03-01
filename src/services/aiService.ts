
import { supabase } from "@/integrations/supabase/client";
import { triggerVerification, validateFileAvailability } from "./fileOperations";
import { wait } from "@/utils/retryUtils";

// Error types for better error handling
export enum AIServiceErrorType {
  NO_FILES = 'no_files',
  VERIFICATION_FAILED = 'verification_failed',
  PROCESSING_FAILED = 'processing_failed',
  NETWORK_ERROR = 'network_error',
  UNKNOWN_ERROR = 'unknown_error'
}

export class AIServiceError extends Error {
  type: AIServiceErrorType;
  details?: any;
  
  constructor(message: string, type: AIServiceErrorType, details?: any) {
    super(message);
    this.name = 'AIServiceError';
    this.type = type;
    this.details = details;
  }
}

/**
 * Trigger an AI response with enhanced file handling and error reporting
 */
export async function triggerAIResponse(params: {
  fileIds: string[];
  query: string;
  userId: string;
  sessionId: string;
  messageId: string;
}) {
  console.log('Triggering AI response for message:', params.messageId, 'with files:', params.fileIds);
  
  try {
    if (!params.fileIds.length) {
      const error = new AIServiceError(
        'No files provided for AI processing', 
        AIServiceErrorType.NO_FILES
      );
      await updateMessageToFailed(params.messageId, error);
      throw error;
    }
    
    // Enhanced verification with multiple attempts and detailed logging
    console.log('Starting enhanced file verification process...');
    const verificationStartTime = Date.now();
    const verificationSuccess = await triggerVerification(params.fileIds);
    const verificationTime = Date.now() - verificationStartTime;
    
    console.log(`File verification ${verificationSuccess ? 'succeeded' : 'failed'} in ${verificationTime}ms`);
    
    if (!verificationSuccess) {
      console.warn('Verification was not fully successful, checking if files are usable anyway...');
      
      // Double-check if we have at least some valid files before giving up
      const hasUsableFiles = await validateFileAvailability(params.fileIds);
      
      if (!hasUsableFiles) {
        const error = new AIServiceError(
          'Files could not be verified for processing', 
          AIServiceErrorType.VERIFICATION_FAILED,
          { fileIds: params.fileIds }
        );
        await updateMessageToFailed(params.messageId, error);
        throw error;
      }
      
      console.log('Some files are usable despite verification issues, proceeding with caution');
    }
    
    // Update message status to processing with detailed stage info
    await supabase
      .from('chat_messages')
      .update({
        status: 'processing',
        processing_stage: {
          stage: 'generating',
          started_at: Date.now(),
          last_updated: Date.now(),
          verification_time_ms: verificationTime,
          verification_status: verificationSuccess ? 'success' : 'partial'
        }
      })
      .eq('id', params.messageId);

    // Call excel-assistant function with enhanced logging
    console.log('Calling excel-assistant with verified files:', params.fileIds);
    console.log('Request payload:', {
      fileIds: params.fileIds,
      query: params.query,
      userId: params.userId,
      sessionId: params.sessionId,
      messageId: params.messageId
    });
    
    const aiResponse = await supabase.functions.invoke('excel-assistant', {
      body: {
        fileIds: params.fileIds,
        query: params.query,
        userId: params.userId,
        sessionId: params.sessionId,
        threadId: null,
        messageId: params.messageId,
        action: 'query',
        requestId: crypto.randomUUID() // Add request ID for tracing
      }
    });

    if (aiResponse.error) {
      console.error('Error from excel-assistant function:', aiResponse.error);
      
      // Determine error type for better handling
      const errorType = determineErrorType(aiResponse.error);
      const error = new AIServiceError(
        aiResponse.error.message || 'Failed to generate response', 
        errorType,
        { 
          originalError: aiResponse.error,
          functionResponse: aiResponse,
          fileIds: params.fileIds
        }
      );
      
      await updateMessageToFailed(params.messageId, error);
      throw error;
    }

    console.log('Excel-assistant function call successful');
    return aiResponse;
  } catch (error) {
    console.error('Error in triggerAIResponse:', error);
    
    // Ensure error is properly wrapped as AIServiceError
    const serviceError = error instanceof AIServiceError 
      ? error 
      : new AIServiceError(
          error.message || 'An unknown error occurred during processing',
          AIServiceErrorType.UNKNOWN_ERROR,
          { originalError: error }
        );
    
    // Ensure message is marked as failed if not already done
    try {
      await updateMessageToFailed(params.messageId, serviceError);
    } catch (updateError) {
      console.error('Failed to update message status:', updateError);
    }
    
    throw serviceError;
  }
}

// Helper function to update a message to failed status
async function updateMessageToFailed(messageId: string, error: AIServiceError) {
  console.log(`Updating message ${messageId} to failed state due to: ${error.type} - ${error.message}`);
  
  try {
    await supabase
      .from('chat_messages')
      .update({
        status: 'failed',
        content: getErrorMessage(error),
        processing_stage: {
          stage: 'failed',
          error: error.message,
          error_type: error.type,
          error_details: error.details,
          last_updated: Date.now()
        }
      })
      .eq('id', messageId);
      
    console.log(`Message ${messageId} marked as failed`);
  } catch (updateError) {
    console.error('Failed to update message to failed state:', updateError);
    throw updateError;
  }
}

// Helper to determine the type of error from function response
function determineErrorType(error: any): AIServiceErrorType {
  if (!error) return AIServiceErrorType.UNKNOWN_ERROR;
  
  const message = (error.message || '').toLowerCase();
  
  if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return AIServiceErrorType.NETWORK_ERROR;
  }
  
  if (message.includes('file') && (message.includes('access') || message.includes('not found') || message.includes('unavailable'))) {
    return AIServiceErrorType.VERIFICATION_FAILED;
  }
  
  if (message.includes('processing') || message.includes('generation')) {
    return AIServiceErrorType.PROCESSING_FAILED;
  }
  
  return AIServiceErrorType.UNKNOWN_ERROR;
}

// Get a user-friendly error message based on error type
function getErrorMessage(error: AIServiceError): string {
  switch (error.type) {
    case AIServiceErrorType.NO_FILES:
      return 'No files were provided for analysis. Please upload at least one Excel file.';
    
    case AIServiceErrorType.VERIFICATION_FAILED:
      return 'I couldn\'t access the uploaded files. Please try uploading them again or use different files.';
    
    case AIServiceErrorType.PROCESSING_FAILED:
      return 'There was an error processing your request. The system couldn\'t analyze your files properly.';
    
    case AIServiceErrorType.NETWORK_ERROR:
      return 'A network error occurred while processing your request. Please try again in a moment.';
    
    case AIServiceErrorType.UNKNOWN_ERROR:
    default:
      return 'An unexpected error occurred. Please try again or contact support if the issue persists.';
  }
}
