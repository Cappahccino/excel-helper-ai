
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

    // Get unverified files that haven't been deleted
    const { data: files, error: fetchError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('storage_verified', false)
      .is('deleted_at', null)
      .limit(50);

    if (fetchError) throw fetchError;
    console.log(`📝 [${requestId}] Found ${files?.length || 0} unverified files`);

    const results = [];
    for (const file of files || []) {
      try {
        // Check if file exists in storage
        const { data, error: storageError } = await supabase.storage
          .from('excel_files')
          .download(file.file_path);

        const isVerified = !storageError && data !== null;
        console.log(`🔍 [${requestId}] File ${file.filename}: ${isVerified ? 'verified' : 'not found in storage'}`);

        // Update file verification status
        const { error: updateError } = await supabase
          .from('excel_files')
          .update({
            storage_verified: isVerified,
            last_accessed_at: isVerified ? new Date().toISOString() : null,
          })
          .eq('id', file.id);

        if (updateError) throw updateError;

        results.push({
          id: file.id,
          filename: file.filename,
          verified: isVerified,
        });
      } catch (error) {
        console.error(`❌ [${requestId}] Error verifying file ${file.filename}:`, error);
        results.push({
          id: file.id,
          filename: file.filename,
          verified: false,
          error: error.message,
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
