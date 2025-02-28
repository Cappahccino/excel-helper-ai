
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

  try {
    // Get URL params - this will extract the file_id from the path
    const url = new URL(req.url);
    const fileId = url.pathname.split('/').pop();

    if (!fileId) {
      return new Response(JSON.stringify({ error: 'File ID is required' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Get OpenAI API key from environment
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log(`Fetching image with file ID: ${fileId}`);

    // Fetch the image from OpenAI
    const imageResponse = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
    });

    if (!imageResponse.ok) {
      console.error(`OpenAI API error: ${imageResponse.status} ${imageResponse.statusText}`);
      return new Response(JSON.stringify({ 
        error: `Failed to fetch image from OpenAI: ${imageResponse.status} ${imageResponse.statusText}` 
      }), { 
        status: imageResponse.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Get the image data
    const imageData = await imageResponse.arrayBuffer();
    
    // Determine content type (default to png if not provided)
    const contentType = imageResponse.headers.get('content-type') || 'image/png';

    // Return the image with appropriate content type
    return new Response(imageData, { 
      headers: { 
        ...corsHeaders, 
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
      } 
    });
  } catch (error) {
    console.error('Error serving image:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to serve image: ' + (error.message || 'Unknown error') 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
