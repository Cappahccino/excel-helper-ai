
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FileData {
  id: string;
  content: any[];
  headers: string[];
  summary?: {
    rowCount: number;
    columnCount: number;
  };
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] Excel assistant started`);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { fileIds, query, userId, sessionId, messageId, action = 'query' } = await req.json();
    console.log(`📝 [${requestId}] Processing request:`, { action, fileIds, messageId });

    // Verify files are ready for processing
    const { data: files, error: filesError } = await supabase
      .from('excel_files')
      .select('*')
      .in('id', fileIds)
      .eq('storage_verified', true);

    if (filesError) {
      console.error(`❌ [${requestId}] Error fetching files:`, filesError);
      throw filesError;
    }

    if (!files?.length) {
      throw new Error('No processed files available for query');
    }

    // Process each file
    const processedFiles: FileData[] = [];
    for (const file of files) {
      console.log(`📊 [${requestId}] Processing file ${file.id}`);
      
      try {
        // Update file status to processing
        await supabase
          .from('excel_files')
          .update({ processing_status: 'processing', processing_started_at: new Date().toISOString() })
          .eq('id', file.id);

        // Download file
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('excel_files')
          .download(file.file_path);

        if (downloadError) throw downloadError;

        // Process Excel file
        const workbook = XLSX.read(await fileData.arrayBuffer(), { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        // Extract headers and data
        const headers = jsonData[0] as string[];
        const content = jsonData.slice(1);

        processedFiles.push({
          id: file.id,
          content,
          headers,
          summary: {
            rowCount: content.length,
            columnCount: headers.length
          }
        });

        // Mark file as completed
        await supabase
          .from('excel_files')
          .update({
            processing_status: 'completed',
            processing_completed_at: new Date().toISOString()
          })
          .eq('id', file.id);

      } catch (error) {
        console.error(`❌ [${requestId}] Error processing file ${file.id}:`, error);
        
        // Update file status to error
        await supabase
          .from('excel_files')
          .update({
            processing_status: 'error',
            error_message: error.message
          })
          .eq('id', file.id);

        throw error;
      }
    }

    // Generate response based on processed files
    const response = generateResponse(query, processedFiles);
    console.log(`✍️ [${requestId}] Generated response for query:`, query);

    // Update message with response
    const { error: messageError } = await supabase
      .from('chat_messages')
      .update({
        content: response,
        status: 'completed',
        metadata: {
          processing_stage: {
            stage: 'completed',
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId);

    if (messageError) {
      console.error(`❌ [${requestId}] Error updating message:`, messageError);
      throw messageError;
    }

    console.log(`✅ [${requestId}] Successfully processed query`);
    return new Response(
      JSON.stringify({ 
        success: true,
        response,
        filesProcessed: processedFiles.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`❌ Error in excel-assistant:`, error);
    
    // Update message status to failed
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
      await supabase
        .from('chat_messages')
        .update({
          status: 'failed',
          content: 'Sorry, there was an error processing your request. Please try again.',
          metadata: {
            error: error.message,
            processing_stage: {
              stage: 'error',
              last_updated: Date.now()
            }
          }
        })
        .eq('id', messageId);
    } catch (updateError) {
      console.error('Failed to update message status:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function generateResponse(query: string, files: FileData[]): string {
  // Basic response generation
  const fileSummaries = files.map(file => {
    return `File contains ${file.summary?.rowCount} rows and ${file.summary?.columnCount} columns with headers: ${file.headers.join(', ')}`;
  });

  return `I've analyzed the files you provided:\n\n${fileSummaries.join('\n\n')}\n\nYour query was: "${query}"\n\nBased on the data, I can help you analyze these files. What specific aspects would you like to know about?`;
}
