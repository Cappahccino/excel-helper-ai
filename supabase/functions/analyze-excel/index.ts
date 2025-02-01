import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LambdaResponse {
  fileName: string;
  fileSize: number;
  message: string;
  openAiResponse: {
    model: string;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    responseContent: string;
  };
  timestamp: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get request data
    const { fileId, query, userId } = await req.json();
    console.log('Processing request for file:', fileId);

    if (!fileId || !query || !userId) {
      throw new Error('Missing required parameters');
    }

    // Get Lambda configuration
    const lambdaAuthToken = Deno.env.get('LAMBDA_AUTH_TOKEN');
    const lambdaUrl = Deno.env.get('LAMBDA_FUNCTION_URL');

    if (!lambdaAuthToken || !lambdaUrl) {
      throw new Error('Lambda configuration missing');
    }

    // Call AWS Lambda function
    console.log('Calling Lambda function...');
    const lambdaResponse = await fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lambdaAuthToken}`,
      },
      body: JSON.stringify({
        fileId,
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

    // Parse and validate Lambda response
    const analysis = await lambdaResponse.json() as LambdaResponse;
    console.log('Received Lambda response:', analysis);

    if (!analysis || !analysis.message || !analysis.openAiResponse) {
      console.error('Invalid Lambda response structure:', analysis);
      throw new Error('Invalid response structure from Lambda');
    }

    // Store the analysis in chat_messages
    console.log('Storing analysis in database...');
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
      throw new Error('Failed to store analysis results');
    }

    // Return success response
    return new Response(
      JSON.stringify({ 
        message: analysis.message,
        model: analysis.openAiResponse.model,
        usage: analysis.openAiResponse.usage
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
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      }),
      { 
        status: error instanceof Error && error.message.includes('Invalid response') ? 400 : 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});