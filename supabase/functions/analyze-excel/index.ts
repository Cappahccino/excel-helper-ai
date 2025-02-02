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
    // Parse request body
    const requestData = await req.json();
    console.log('Received request data:', requestData);

    const { fileId, query, userId } = requestData;

    if (!fileId || !query || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: fileId, query, and userId are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Initialize Supabase client using environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get file metadata from Supabase
    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError) {
      console.error('Error fetching file metadata:', fileError);
      throw new Error('Failed to fetch file metadata');
    }

    // Download file from storage
    const { data: fileBuffer, error: downloadError } = await supabase.storage
      .from('excel_files')
      .download(fileData.file_path);

    if (downloadError) {
      console.error('Error downloading file:', downloadError);
      throw new Error('Failed to download Excel file');
    }

    // Call Lambda function for analysis
    const lambdaAuthToken = Deno.env.get('LAMBDA_AUTH_TOKEN');
    const lambdaUrl = Deno.env.get('LAMBDA_FUNCTION_URL');

    if (!lambdaAuthToken || !lambdaUrl) {
      throw new Error('Lambda configuration missing');
    }

    console.log('Calling Lambda function for analysis...');
    
    const lambdaResponse = await fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lambdaAuthToken}`,
      },
      body: JSON.stringify({
        fileId,
        query,
        userId
      }),
    });

    if (!lambdaResponse.ok) {
      console.error('Lambda error status:', lambdaResponse.status);
      const errorText = await lambdaResponse.text();
      console.error('Lambda error response:', errorText);
      throw new Error(`Lambda error: ${errorText || 'Unknown error'}`);
    }

    const analysis = await lambdaResponse.json();
    console.log('Analysis received from Lambda:', analysis);

    // Validate and extract the response content
    if (!analysis || !analysis.choices?.[0]?.message?.content) {
      throw new Error('Invalid response format from Lambda');
    }

    const responseData = {
      message: analysis.choices[0].message.content,
      chat_id: analysis.id,
      openAiResponse: {
        model: analysis.model,
        usage: analysis.usage,
        raw_response: analysis
      }
    };

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-excel function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});