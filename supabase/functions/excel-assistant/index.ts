
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import OpenAI from "https://deno.land/x/openai@v4.24.0/mod.ts";
import { Database } from '../_shared/database.types.ts';

// Constants for configuration
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Initialize clients
const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// CORS headers for browser access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function updateMessageStatus(messageId: string, status: string, metadata?: any) {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      status,
      metadata: {
        ...metadata,
        processing_stage: {
          stage: status,
          last_updated: Date.now()
        }
      }
    })
    .eq('id', messageId);

  if (error) {
    console.error('Error updating message status:', error);
    throw error;
  }
}

async function processExcelData(fileIds: string[]) {
  const { data: files, error } = await supabase
    .from('excel_files')
    .select('*')
    .in('id', fileIds);

  if (error) throw error;
  if (!files?.length) throw new Error('No files found');

  return files.map(file => ({
    id: file.id,
    filename: file.filename,
    status: file.processing_status,
    size: file.file_size
  }));
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileIds, query, userId, sessionId, messageId, action = 'query' } = await req.json();
    console.log('Processing request:', { fileIds, messageId, action });

    // Initial status update
    await updateMessageStatus(messageId, 'processing', {
      stage: 'initializing',
      started_at: Date.now()
    });

    // Process Excel files
    const files = await processExcelData(fileIds);
    console.log('Processed files:', files);

    // Create or retrieve thread for the session
    let thread;
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('thread_id')
      .eq('session_id', sessionId)
      .single();

    if (session?.thread_id) {
      thread = await openai.beta.threads.retrieve(session.thread_id);
    } else {
      thread = await openai.beta.threads.create();
      await supabase
        .from('chat_sessions')
        .update({ thread_id: thread.id })
        .eq('session_id', sessionId);
    }

    // Create message in thread
    await updateMessageStatus(messageId, 'in_progress', {
      stage: 'analyzing',
      thread_id: thread.id
    });

    const message = await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: `Analyze these Excel files: ${files.map(f => f.filename).join(', ')}. Query: ${query}`,
    });

    // Create run with Excel analysis assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: 'asst_excel_analyst',
      instructions: `Analyze the Excel files and respond to: ${query}. Use code interpreter when needed.`,
    });

    // Poll for completion
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
      await updateMessageStatus(messageId, 'in_progress', {
        stage: 'generating',
        run_id: run.id,
        completion_percentage: runStatus.status === 'in_progress' ? 50 : 25
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }

    if (runStatus.status === 'completed') {
      // Get the assistant's response
      const messages = await openai.beta.threads.messages.list(thread.id);
      const assistantMessage = messages.data.find(m => 
        m.run_id === run.id && m.role === 'assistant'
      );

      if (!assistantMessage) {
        throw new Error('No assistant message found');
      }

      // Update message with response
      const { error: updateError } = await supabase
        .from('chat_messages')
        .update({
          content: assistantMessage.content[0].text.value,
          status: 'completed',
          metadata: {
            completion_time: Date.now(),
            thread_id: thread.id,
            run_id: run.id,
            openai_message_id: assistantMessage.id
          }
        })
        .eq('id', messageId);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ 
        status: 'completed',
        message: assistantMessage.content[0].text.value
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      throw new Error(`Run failed with status: ${runStatus.status}`);
    }

  } catch (error) {
    console.error('Error in excel-assistant:', error);
    
    // Update message status to failed
    try {
      await updateMessageStatus(messageId, 'failed', {
        error: error.message,
        failed_at: Date.now()
      });
    } catch (statusError) {
      console.error('Error updating failure status:', statusError);
    }

    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
