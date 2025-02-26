
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { processExcelFiles } from "./excel.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

const PROCESSING_TIMEOUT = 300000; // 5 minutes
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface RequestBody {
  fileIds: string[];
  query: string;
  userId: string;
  sessionId: string;
  messageId: string;
  threadId?: string | null;
}

enum ProcessingStatus {
  PENDING = 'pending',
  VALIDATING = 'validating',
  PROCESSING = 'processing',
  ANALYZING = 'analyzing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

class FileProcessingError extends Error {
  constructor(
    message: string,
    public messageId: string,
    public fileIds: string[],
    public stage: string
  ) {
    super(message);
    this.name = 'FileProcessingError';
  }
}

async function validateFiles(fileIds: string[]): Promise<boolean> {
  console.log('Validating files:', fileIds);
  
  const { data: files, error } = await supabase
    .from('excel_files')
    .select('id, processing_status, storage_verified, file_path')
    .in('id', fileIds);

  if (error) {
    console.error('Error validating files:', error);
    return false;
  }

  const invalidFiles = files.filter(
    f => !f.storage_verified || f.processing_status !== 'completed'
  );

  if (invalidFiles.length > 0) {
    console.warn('Invalid files found:', invalidFiles);
    return false;
  }

  return true;
}

async function updateMessageStatus(
  messageId: string, 
  status: ProcessingStatus, 
  details?: Record<string, any>
) {
  console.log(`Updating message ${messageId} status to ${status}`, details);
  
  const { error } = await supabase
    .from('chat_messages')
    .update({
      status,
      metadata: {
        processing_stage: {
          stage: status,
          started_at: Date.now(),
          last_updated: Date.now(),
          ...(details || {})
        }
      }
    })
    .eq('id', messageId);

  if (error) {
    console.error('Error updating message status:', error);
    throw error;
  }
}

async function acquireProcessingLock(lockKey: string): Promise<boolean> {
  // Use the metadata table as a simple locking mechanism
  const { data, error } = await supabase
    .from('file_metadata')
    .insert({
      file_id: lockKey,
      column_definitions: { locked: true },
      created_at: new Date().toISOString()
    })
    .select()
    .maybeSingle();

  if (error?.code === '23505') { // Unique violation
    return false;
  }

  return !error && !!data;
}

async function releaseLock(lockKey: string) {
  await supabase
    .from('file_metadata')
    .delete()
    .eq('file_id', lockKey);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const input: RequestBody = await req.json();
    const { fileIds, query, userId, sessionId, messageId, threadId } = input;

    if (!fileIds?.length || !query || !userId || !sessionId || !messageId) {
      throw new FileProcessingError(
        'Missing required parameters',
        messageId,
        fileIds || [],
        'validation'
      );
    }

    console.log('Processing request:', {
      fileIds,
      sessionId,
      messageId,
      threadId: threadId || 'none'
    });

    // Validate session exists and is active
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('status')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError || !session || session.status !== 'active') {
      throw new FileProcessingError(
        'Invalid or inactive session',
        messageId,
        fileIds,
        'session_validation'
      );
    }

    // Verify file associations with session
    const { data: sessionFiles, error: filesError } = await supabase
      .from('session_files')
      .select('file_id')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .in('file_id', fileIds);

    if (filesError || !sessionFiles?.length) {
      throw new FileProcessingError(
        'Files not properly associated with session',
        messageId,
        fileIds,
        'file_association'
      );
    }

    const validFileIds = sessionFiles.map(sf => sf.file_id);
    if (validFileIds.length !== fileIds.length) {
      const invalidFiles = fileIds.filter(id => !validFileIds.includes(id));
      throw new FileProcessingError(
        `Some files are not associated with the session: ${invalidFiles.join(', ')}`,
        messageId,
        invalidFiles,
        'file_validation'
      );
    }

    // Try to acquire processing lock
    const lockKey = `processing:${sessionId}:${messageId}`;
    const lockAcquired = await acquireProcessingLock(lockKey);
    if (!lockAcquired) {
      throw new FileProcessingError(
        'Files are already being processed',
        messageId,
        fileIds,
        'lock_acquisition'
      );
    }

    try {
      // Validate file status
      const filesValid = await validateFiles(validFileIds);
      if (!filesValid) {
        throw new FileProcessingError(
          'Some files are not properly processed or accessible',
          messageId,
          validFileIds,
          'file_validation'
        );
      }

      // Update message to processing status
      await updateMessageStatus(messageId, ProcessingStatus.PROCESSING, {
        files: validFileIds,
        query
      });

      // Process files with enhanced error handling and timeout
      const processingPromise = processExcelFiles(validFileIds, messageId);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Processing timeout')), PROCESSING_TIMEOUT);
      });

      const processingResult = await Promise.race([processingPromise, timeoutPromise]);
      
      if (!processingResult.success) {
        throw new FileProcessingError(
          `File processing failed: ${processingResult.errors?.map(e => e.error).join(', ')}`,
          messageId,
          validFileIds,
          'processing'
        );
      }

      // Update processing status to complete
      await updateMessageStatus(messageId, ProcessingStatus.COMPLETED, {
        completion_percentage: 100,
        processed_files: validFileIds.length
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: processingResult.data,
          metadata: processingResult.metadata
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } finally {
      // Always release the lock
      await releaseLock(lockKey);
    }

  } catch (error) {
    console.error('Error processing request:', error);

    // Update message status to failed
    if (error instanceof FileProcessingError) {
      await supabase
        .from('chat_messages')
        .update({
          status: ProcessingStatus.FAILED,
          content: `Error: ${error.message}`,
          metadata: {
            processing_stage: {
              stage: 'failed',
              error: error.message,
              error_stage: error.stage,
              last_updated: Date.now()
            }
          }
        })
        .eq('id', error.messageId);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unexpected error occurred'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.status || 500
      }
    );
  }
});

