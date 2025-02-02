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
    const requestData = await req.json();
    console.log('Received request data:', JSON.stringify(requestData, null, 2));

    const { fileId, query, userId } = requestData;
    if (!fileId || !query || !userId) {
      throw new Error('Missing required fields: fileId, query, and userId are required');
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

    // Store user's query message
    const { error: userMessageError } = await supabase
      .from('chat_messages')
      .insert({
        content: query,
        excel_file_id: fileId,
        is_ai_response: false,
        user_id: userId
      });

    if (userMessageError) {
      console.error('Error storing user message:', userMessageError);
      throw userMessageError;
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
    console.log('Edge function received Lambda response:', analysis);

    // Parse the Lambda response body
    const parsedBody = JSON.parse(analysis.body);
    console.log('Parsed Lambda response body:', parsedBody);

    if (!parsedBody || !parsedBody.openAiResponse) {
      throw new Error('Invalid response from Lambda');
    }

    // Store AI response with metadata
    const { error: aiMessageError } = await supabase
      .from('chat_messages')
      .insert({
        content: parsedBody.message,
        excel_file_id: fileId,
        is_ai_response: true,
        user_id: userId,
        chat_id: parsedBody.openAiResponse.id,
        openai_model: parsedBody.openAiResponse.model,
        openai_usage: parsedBody.openAiResponse.usage,
        raw_response: parsedBody.openAiResponse
      });

    if (aiMessageError) {
      console.error('Error storing AI response:', aiMessageError);
      throw aiMessageError;
    }

    console.log('Successfully stored AI response with metadata');

    return new Response(
      JSON.stringify(parsedBody),
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