import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, query } = await req.json();
    console.log('Processing file:', fileId, 'with query:', query);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get file metadata from database
    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !fileData) {
      console.error('Error fetching file data:', fileError);
      throw new Error('File not found');
    }

    // Get the Lambda auth token
    const lambdaAuthToken = Deno.env.get('LAMBDA_AUTH_TOKEN');
    if (!lambdaAuthToken) {
      throw new Error('Lambda authentication token not configured');
    }

    // Call AWS Lambda function with authentication
    const lambdaResponse = await fetch('YOUR_LAMBDA_FUNCTION_URL', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lambdaAuthToken}`,
      },
      body: JSON.stringify({
        fileId,
        filePath: fileData.file_path,
        query,
        supabaseUrl,
        supabaseKey,
      }),
    });

    if (!lambdaResponse.ok) {
      console.error('Lambda error status:', lambdaResponse.status);
      const errorText = await lambdaResponse.text();
      console.error('Lambda error response:', errorText);
      
      if (lambdaResponse.status === 401) {
        throw new Error('Unauthorized: Invalid Lambda authentication token');
      }
      throw new Error('Error processing file with Lambda');
    }

    const analysis = await lambdaResponse.json();
    console.log('Analysis received from Lambda:', analysis);

    // Store the analysis in chat_messages using background task
    EdgeRuntime.waitUntil(
      supabase
        .from('chat_messages')
        .insert({
          excel_file_id: fileId,
          content: analysis.message,
          is_ai_response: true,
          user_id: fileData.user_id,
        })
        .then(({ error }) => {
          if (error) console.error('Error storing analysis:', error);
        })
    );

    // Update last_accessed timestamp
    EdgeRuntime.waitUntil(
      supabase
        .from('excel_files')
        .update({ last_accessed: new Date().toISOString() })
        .eq('id', fileId)
        .then(({ error }) => {
          if (error) console.error('Error updating last_accessed:', error);
        })
    );

    return new Response(
      JSON.stringify({ message: analysis.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-excel function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: error.message.includes('Unauthorized') ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});