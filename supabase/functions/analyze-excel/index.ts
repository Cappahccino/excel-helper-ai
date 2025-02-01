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
    // Parse request body and validate required fields
    let requestData;
    try {
      const body = await req.text();
      requestData = JSON.parse(body);
      console.log('Received raw request data:', body);
      console.log('Parsed request data:', requestData);
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      throw new Error('Invalid request body format');
    }

    // Extract fields using snake_case consistently
    const { excel_file_id, query, user_id } = requestData;
    
    console.log('Extracted fields:', { excel_file_id, query, user_id });

    if (!excel_file_id || !query || !user_id) {
      const missingFields = [];
      if (!excel_file_id) missingFields.push('excel_file_id');
      if (!query) missingFields.push('query');
      if (!user_id) missingFields.push('user_id');
      
      const errorMessage = `Missing required fields: ${missingFields.join(', ')}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get file metadata from database
    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', excel_file_id)
      .single();

    if (fileError || !fileData) {
      console.error('Error fetching file data:', fileError);
      throw new Error(fileError?.message || 'File not found');
    }

    // Get the Lambda auth token
    const lambdaAuthToken = Deno.env.get('LAMBDA_AUTH_TOKEN');
    const lambdaUrl = Deno.env.get('LAMBDA_FUNCTION_URL');

    if (!lambdaAuthToken || !lambdaUrl) {
      throw new Error('Lambda configuration missing');
    }

    console.log('Calling Lambda function for file:', fileData.filename);
    
    // Call AWS Lambda function
    const lambdaResponse = await fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lambdaAuthToken}`,
      },
      body: JSON.stringify({
        excel_file_id,
        file_path: fileData.file_path,
        query,
        supabaseUrl,
        supabaseKey,
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

    if (!analysis || !analysis.openAiResponse) {
      throw new Error('Invalid response format from Lambda');
    }

    // Store the message in chat_messages
    const { error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        content: analysis.message,
        excel_file_id,
        is_ai_response: true,
        user_id,
        openai_model: analysis.openAiResponse.model,
        openai_usage: analysis.openAiResponse.usage,
        raw_response: analysis.openAiResponse
      });

    if (messageError) {
      console.error('Error storing message:', messageError);
      throw messageError;
    }

    return new Response(
      JSON.stringify({ 
        message: analysis.message,
        file_name: fileData.filename,
        file_size: fileData.file_size,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in analyze-excel function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    );
  }
});