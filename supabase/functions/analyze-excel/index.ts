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

    const { fileId, query, userId } = requestData;
    
    console.log('Extracted fields:', { fileId, query, userId });

    if (!fileId || !query || !userId) {
      const missingFields = [];
      if (!fileId) missingFields.push('fileId');
      if (!query) missingFields.push('query');
      if (!userId) missingFields.push('userId');
      
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
      .eq('id', fileId)
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
      throw new Error(`Lambda error: ${errorText || 'Unknown error'}`);
    }

    const analysis = await lambdaResponse.json();
    console.log('Analysis received from Lambda:', analysis);

    if (!analysis || !analysis.openAiResponse) {
      throw new Error('Invalid response format from Lambda');
    }

    // Store the message in chat_messages with OpenAI metadata
    const { error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        content: analysis.message,
        excel_file_id: fileId,
        is_ai_response: true,
        user_id: userId,
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
        fileName: analysis.fileName,
        fileSize: analysis.fileSize,
        timestamp: analysis.timestamp
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
        status: error.message?.includes('Unauthorized') ? 401 : 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    );
  }
});