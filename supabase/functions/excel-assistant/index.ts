
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import OpenAI from "https://deno.land/x/openai@v4.24.0/mod.ts";

// Constants for configuration
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// CORS headers for browser access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function updateMessageStatus(messageId: string, status: string, metadata?: any) {
  console.log(`Updating message ${messageId} to status: ${status}`);
  
  const { error } = await supabase
    .from('chat_messages')
    .update({
      status,
      processing_stage: {
        stage: status,
        last_updated: Date.now(),
        ...(metadata?.stage && { stage: metadata.stage }),
        ...(metadata?.completion_percentage && { completion_percentage: metadata.completion_percentage })
      },
      metadata: {
        ...metadata,
        processing_stage: {
          stage: status === 'processing' ? metadata?.stage || 'generating' : status,
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

async function directAnalyzeWithOpenAI(query: string, files: any[]) {
  console.log('Analyzing with OpenAI directly', { query, files: files.map(f => f.filename) });
  
  try {
    // Create a system message with file details
    const fileDetails = files.map(f => `${f.filename} (${f.size} bytes)`).join('\n- ');
    const systemMessage = `You are an Excel analysis assistant. The user has uploaded the following Excel files:\n- ${fileDetails}\n\nYour task is to analyze and respond to queries about these files. Be clear, concise, and helpful.`;

    // Use the OpenAI API directly with the chat completions endpoint
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: query }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error in OpenAI analysis:', error);
    throw error;
  }
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

    // Update to analyzing stage
    await updateMessageStatus(messageId, 'processing', {
      stage: 'analyzing',
      completion_percentage: 25
    });

    // Directly analyze with OpenAI instead of using assistants API
    const analysisText = await directAnalyzeWithOpenAI(query, files);
    
    // Update to generating stage
    await updateMessageStatus(messageId, 'processing', {
      stage: 'generating',
      completion_percentage: 75
    });

    console.log('Analysis completed successfully');

    // Update message with response
    const { error: updateError } = await supabase
      .from('chat_messages')
      .update({
        content: analysisText,
        status: 'completed',
        processing_stage: {
          stage: 'completed',
          last_updated: Date.now(),
          completion_percentage: 100
        },
        metadata: {
          completion_time: Date.now()
        }
      })
      .eq('id', messageId);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ 
      status: 'completed',
      message: analysisText
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

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
