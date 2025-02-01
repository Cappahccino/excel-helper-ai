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

    // Get the Lambda auth token
    const lambdaAuthToken = Deno.env.get('LAMBDA_AUTH_TOKEN');
    const lambdaUrl = Deno.env.get('LAMBDA_FUNCTION_URL');

    if (!lambdaAuthToken || !lambdaUrl) {
      throw new Error('Lambda configuration missing');
    }

    console.log('Calling Lambda function for analysis');
    
    // Call AWS Lambda function with proper authentication
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

    const lambdaResult = await lambdaResponse.json();
    console.log('Lambda response received:', JSON.stringify(lambdaResult, null, 2));

    // Validate the Lambda response
    if (!lambdaResult || !lambdaResult.message) {
      console.error('Invalid Lambda response format:', lambdaResult);
      throw new Error('Invalid response format from Lambda');
    }

    // Return the response in the expected format
    return new Response(
      JSON.stringify({
        message: lambdaResult.message,
        fileName: lambdaResult.fileName,
        fileSize: lambdaResult.fileSize,
        timestamp: lambdaResult.timestamp
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