
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`🚀 [${requestId}] Storage verification started`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get unverified files or files stuck in pending state
    const { data: files, error: fetchError } = await supabase
      .from('excel_files')
      .select('*')
      .or('storage_verified.eq.false,processing_status.eq.pending')
      .is('deleted_at', null)
      .limit(50);

    if (fetchError) throw fetchError;
    console.log(`📝 [${requestId}] Found ${files?.length || 0} files to verify`);

    const results = [];
    for (const file of files || []) {
      try {
        console.log(`🔍 [${requestId}] Verifying file ${file.filename}`);
        
        // Update status to verifying
        await supabase
          .from('excel_files')
          .update({ 
            processing_status: 'verifying',
            processing_started_at: new Date().toISOString()
          })
          .eq('id', file.id);

        // Check if file exists in storage
        const { data, error: storageError } = await supabase.storage
          .from('excel_files')
          .download(file.file_path);

        const isVerified = !storageError && data !== null;

        if (isVerified) {
          // File exists, update status
          const { error: updateError } = await supabase
            .from('excel_files')
            .update({
              storage_verified: true,
              processing_status: 'processing',
              last_accessed_at: new Date().toISOString(),
            })
            .eq('id', file.id);

          if (updateError) throw updateError;

          // Trigger excel-assistant for analysis
          const { error: analysisError } = await supabase.functions.invoke('excel-assistant', {
            body: {
              action: 'analyze',
              fileId: file.id,
              filePath: file.file_path
            }
          });

          if (analysisError) {
            console.error(`❌ [${requestId}] Analysis error for ${file.filename}:`, analysisError);
          }

          results.push({
            id: file.id,
            filename: file.filename,
            verified: true,
            status: 'processing'
          });
        } else {
          // File doesn't exist, mark as error
          await supabase
            .from('excel_files')
            .update({
              storage_verified: false,
              processing_status: 'error',
              error_message: 'File not found in storage'
            })
            .eq('id', file.id);

          results.push({
            id: file.id,
            filename: file.filename,
            verified: false,
            error: 'File not found in storage'
          });
        }
      } catch (error) {
        console.error(`❌ [${requestId}] Error verifying file ${file.filename}:`, error);
        results.push({
          id: file.id,
          filename: file.filename,
          verified: false,
          error: error.message
        });
      }
    }

    console.log(`✅ [${requestId}] Storage verification completed`);
    return new Response(
      JSON.stringify({ 
        success: true,
        verified: results 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error(`❌ [${requestId}] Storage verification failed:`, error);
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
