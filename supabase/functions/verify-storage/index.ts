
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

    // Get request parameters
    const { fileIds } = await req.json();
    
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('Invalid or missing fileIds parameter');
    }
    
    console.log(`📝 [${requestId}] Verifying ${fileIds.length} files: ${fileIds.join(', ')}`);

    const results = [];
    for (const fileId of fileIds) {
      try {
        // Get file details
        const { data: file, error: fileError } = await supabase
          .from('excel_files')
          .select('*')
          .eq('id', fileId)
          .maybeSingle();

        if (fileError || !file) {
          console.error(`❌ [${requestId}] Error retrieving file ${fileId}:`, fileError || 'File not found');
          results.push({
            id: fileId,
            verified: false,
            error: fileError?.message || 'File not found'
          });
          continue;
        }

        console.log(`🔍 [${requestId}] Processing file ${file.filename} (${file.id})`);
        
        // Single operation to check if file exists in storage
        const { data, error: storageError } = await supabase.storage
          .from('excel_files')
          .download(file.file_path);

        const isVerified = !storageError && data !== null;

        if (isVerified) {
          // Immediately mark as "completed" if file exists
          const { error: updateError } = await supabase
            .from('excel_files')
            .update({
              storage_verified: true,
              processing_status: 'completed',
              processing_completed_at: new Date().toISOString(),
              last_accessed_at: new Date().toISOString(),
            })
            .eq('id', fileId);

          if (updateError) {
            console.error(`❌ [${requestId}] Update error for ${file.filename}:`, updateError);
            results.push({
              id: fileId,
              filename: file.filename,
              verified: false,
              error: updateError.message
            });
            continue;
          }

          console.log(`✅ [${requestId}] File ${file.filename} verified successfully`);
          results.push({
            id: fileId,
            filename: file.filename,
            verified: true,
            status: 'completed'
          });
        } else {
          // Clear error state with descriptive message
          await supabase
            .from('excel_files')
            .update({
              storage_verified: false,
              processing_status: 'error',
              error_message: 'File not found in storage'
            })
            .eq('id', fileId);

          console.error(`❌ [${requestId}] File ${file.filename} not found in storage`);
          results.push({
            id: fileId,
            filename: file.filename,
            verified: false,
            error: 'File not found in storage'
          });
        }
      } catch (error) {
        console.error(`❌ [${requestId}] Error verifying file ${fileId}:`, error);
        results.push({
          id: fileId,
          verified: false,
          error: error.message
        });
      }
    }

    console.log(`✅ [${requestId}] Verification completed for ${results.length} files`);
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
