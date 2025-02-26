
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { processExcelFiles } from "./excel.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const input: RequestBody = await req.json();
    const { fileIds, query, userId, sessionId, messageId, threadId } = input;

    if (!fileIds?.length || !query || !userId || !sessionId || !messageId) {
      throw new Error('Missing required parameters');
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
      .single();

    if (sessionError || !session || session.status !== 'active') {
      throw new Error('Invalid or inactive session');
    }

    // Verify file associations with session
    const { data: sessionFiles, error: filesError } = await supabase
      .from('session_files')
      .select('file_id')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .in('file_id', fileIds);

    if (filesError || !sessionFiles?.length) {
      throw new Error('Files not properly associated with session');
    }

    const validFileIds = sessionFiles.map(sf => sf.file_id);
    if (validFileIds.length !== fileIds.length) {
      const invalidFiles = fileIds.filter(id => !validFileIds.includes(id));
      throw new Error(`Some files are not associated with the session: ${invalidFiles.join(', ')}`);
    }

    // Update message processing status
    await supabase
      .from('chat_messages')
      .update({
        metadata: {
          processing_stage: {
            stage: 'processing_files',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId);

    // Process files with enhanced error handling
    const processingResult = await processExcelFiles(validFileIds, messageId);
    
    if (!processingResult.success) {
      throw new Error(`File processing failed: ${processingResult.errors?.map(e => e.error).join(', ')}`);
    }

    // Update processing status to complete
    await supabase
      .from('chat_messages')
      .update({
        status: 'completed',
        metadata: {
          processing_stage: {
            stage: 'completed',
            started_at: Date.now(),
            last_updated: Date.now(),
            completion_percentage: 100
          }
        }
      })
      .eq('id', messageId);

    return new Response(
      JSON.stringify({
        success: true,
        data: processingResult.data,
        metadata: processingResult.metadata
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing request:', error);

    // Update message status to failed
    if (error.messageId) {
      await supabase
        .from('chat_messages')
        .update({
          status: 'failed',
          content: `Error: ${error.message}`,
          metadata: {
            processing_stage: {
              stage: 'failed',
              error: error.message,
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

