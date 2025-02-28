
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import 'https://deno.land/x/xhr@0.3.0/mod.ts';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Set up CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Create Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const openaiApiKey = Deno.env.get('OPENAI_API_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract file ID from URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(part => part);

    if (pathParts.length < 2 || pathParts[0] !== 'fetch-openai-image') {
      return new Response(JSON.stringify({ error: 'Invalid request path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fileId = pathParts[1];

    // Validate file ID
    if (!fileId || typeof fileId !== 'string') {
      return new Response(JSON.stringify({ error: 'File ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Fetching OpenAI image with file ID: ${fileId}`);

    // Verify user session
    const { data: session } = await supabase.auth.getSession(req);
    if (!session?.session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = session.session.user.id;

    // Check if this user has access to the image
    const { data: imageData, error: imageError } = await supabase
      .from('message_generated_images')
      .select('message_generated_images.*, chat_messages.user_id')
      .eq('openai_file_id', fileId)
      .join('chat_messages', { 
        'message_generated_images.message_id': 'chat_messages.id' 
      })
      .maybeSingle();
    
    if (imageError || !imageData) {
      console.error('Error fetching image data or image not found:', imageError);
      return new Response(JSON.stringify({ error: 'Image not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Check if the image belongs to the user
    if (imageData.user_id !== userId) {
      console.error('User does not have access to this image');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if the image has already been cached in Supabase Storage
    const storagePath = `${fileId}.png`;
    const { data: storageFiles, error: storageError } = await supabase.storage
      .from('generated-images')
      .list('', { 
        search: fileId,
        limit: 1
      });

    if (!storageError && storageFiles && storageFiles.length > 0) {
      console.log('Serving cached image from Supabase Storage');
      const { data: publicURL } = supabase.storage
        .from('generated-images')
        .getPublicUrl(storagePath);

      // Update access timestamp
      await supabase
        .from('message_generated_images')
        .update({ 
          metadata: { 
            ...imageData.metadata, 
            last_accessed: new Date().toISOString() 
          } 
        })
        .eq('id', imageData.id);

      // Redirect to the public URL
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': publicURL.publicUrl,
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // Fetch image from OpenAI
    const response = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
    });

    // Check if the image was fetched successfully
    if (!response.ok) {
      console.error('Error fetching image from OpenAI:', response.status, response.statusText);
      return new Response(JSON.stringify({ 
        error: `Error fetching image from OpenAI: ${response.status} ${response.statusText}` 
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the image data
    const imageBytes = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    
    // Cache the image in Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(storagePath, new Blob([imageBytes], { type: contentType }), {
        contentType,
        upsert: true
      });
    
    if (uploadError) {
      console.error('Error caching image in storage:', uploadError);
    } else {
      console.log('Successfully cached image in storage:', uploadData);
    }
    
    // Update access timestamp
    await supabase
      .from('message_generated_images')
      .update({ 
        metadata: { 
          ...imageData.metadata, 
          last_accessed: new Date().toISOString(),
          cached: !uploadError
        } 
      })
      .eq('id', imageData.id);
      
    // Return the image with proper content type
    return new Response(imageBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Error processing image request:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
