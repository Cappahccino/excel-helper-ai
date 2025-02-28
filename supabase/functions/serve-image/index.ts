
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { OpenAI } from "https://esm.sh/openai@4.28.4";

// Get environment variables
const openaiApiKey = Deno.env.get('OPENAI_API_KEY') || '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

// Initialize Supabase client
const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

// CORS headers to allow requests from any origin
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Ensure only GET requests are allowed
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Extract the file ID from the URL path
    const url = new URL(req.url);
    const path = url.pathname;
    const fileId = path.split('/').pop();

    if (!fileId) {
      throw new Error('No file ID provided');
    }

    console.log(`Serving image with OpenAI file ID: ${fileId}`);

    // Validate that this image exists in our database
    const { data: imageData, error: imageError } = await supabase
      .from('message_generated_images')
      .select('*')
      .eq('openai_file_id', fileId)
      .single();

    if (imageError || !imageData) {
      console.error('Image not found in database:', imageError);
      return new Response(JSON.stringify({ error: 'Image not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Download the content from OpenAI
    const response = await openai.files.content(fileId);
    
    if (!response.ok) {
      throw new Error(`Failed to download file from OpenAI: ${response.statusText}`);
    }

    // Get the image data as a blob
    const imageBlob = await response.blob();

    // Set appropriate content type based on the blob
    const contentType = imageBlob.type || 'image/png';

    // Return the image with appropriate headers
    return new Response(imageBlob, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      }
    });
  } catch (error) {
    console.error('Error serving image:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to serve image', 
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
