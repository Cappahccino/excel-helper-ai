import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] Excel assistant started`);

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

    // Handle different actions
    if (action === 'analyze') {
      // Single file analysis mode
      const { fileId, filePath } = await req.json();
      console.log(`🔍 [${requestId}] Analyzing file ${fileId}`);

      try {
        // Update status to analyzing
        await supabase
          .from('excel_files')
          .update({ processing_status: 'analyzing' })
          .eq('id', fileId);

        // Download file for analysis
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('excel_files')
          .download(filePath);

        if (downloadError) throw downloadError;

        // Read and analyze Excel file
        const workbook = XLSX.read(await fileData.arrayBuffer(), { type: 'array' });
        const sheetNames = workbook.SheetNames;
        const firstSheet = workbook.Sheets[sheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        // Extract column definitions
        const headers = jsonData[0];
        const columnDefs = headers.map((header: string, index: number) => {
          const columnData = jsonData.slice(1).map((row: any[]) => row[index]);
          const dataType = inferDataType(columnData);
          return {
            name: header,
            type: dataType,
            sample: columnData.slice(0, 5).filter(v => v !== undefined && v !== null)
          };
        });

        // Store metadata
        await supabase
          .from('file_metadata')
          .insert({
            file_id: fileId,
            column_definitions: columnDefs,
            row_count: jsonData.length - 1,
            data_summary: {
              sheet_count: sheetNames.length,
              sheets: sheetNames,
              last_analyzed: new Date().toISOString()
            }
          })
          .select()
          .single();

        // Mark as completed
        await supabase
          .from('excel_files')
          .update({
            processing_status: 'completed',
            processing_completed_at: new Date().toISOString()
          })
          .eq('id', fileId);

        return new Response(
          JSON.stringify({ 
            success: true,
            fileId,
            status: 'completed'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        console.error(`❌ [${requestId}] Analysis error:`, error);
        await supabase
          .from('excel_files')
          .update({
            processing_status: 'error',
            error_message: error.message
          })
          .eq('id', fileId);

        throw error;
      }
    } else if (action === 'query') {
      // Regular query mode - verify files first
      const { data: files, error: filesError } = await supabase
        .from('excel_files')
        .select('*')
        .in('id', fileIds)
        .eq('storage_verified', true)
        .eq('processing_status', 'completed');

      if (filesError) throw filesError;
      if (!files?.length) {
        throw new Error('No processed files available for query');
      }

      // Process query using verified files
      console.log(`📝 [${requestId}] Processing query: ${query} for files: ${fileIds}`);

      // You would typically use the file data to perform some analysis or generate a response
      // This is a placeholder for your actual data processing logic
      const aiResponse = `This is a dummy response for the query: ${query} based on files: ${fileIds.join(', ')}`;

      // Create assistant message
      const { data: message, error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          user_id: userId,
          content: aiResponse,
          role: 'assistant',
          is_ai_response: true,
          status: 'completed'
        })
        .select()
        .single();

      if (messageError) {
        console.error(`❌ [${requestId}] Message creation error:`, messageError);
        throw messageError;
      }

      // Update the message status to completed
      await supabase
        .from('chat_messages')
        .update({ status: 'completed' })
        .eq('id', messageId);

      console.log(`✅ [${requestId}] Query processed successfully`);
      return new Response(
        JSON.stringify({ 
          success: true,
          message,
          response: aiResponse 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error(`❌ [${requestId}] Excel assistant error:`, error);
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

// Helper function to infer data type from column values
function inferDataType(values: any[]): string {
  const nonNullValues = values.filter(v => v !== null && v !== undefined);
  if (nonNullValues.length === 0) return 'unknown';

  const types = nonNullValues.map(value => {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') {
      // Check for date format
      if (!isNaN(Date.parse(value))) return 'date';
      return 'string';
    }
    return 'unknown';
  });

  // Return most common type
  return types.reduce((acc, curr) => 
    types.filter(t => t === acc).length >= types.filter(t => t === curr).length ? acc : curr
  );
}
