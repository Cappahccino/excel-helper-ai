import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Initialize Supabase client
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error("Environment variables are missing. Ensure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY are set.");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { 
        status: 405, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Extract file ID from the URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const fileId = pathParts.pop();

    if (!fileId) {
      return new Response(JSON.stringify({ error: "File ID is required" }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    console.log(`Fetching image with file ID: ${fileId}`);

    // 🔐 Step 1: Get the User ID from Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("User authentication failed:", authError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // 🔍 Step 2: Verify the image belongs to the user
    const { data: imageRecord, error: imageError } = await supabase
      .from("message_generated_images")
      .select("message_id, openai_file_id, created_at")
      .eq("openai_file_id", fileId)
      .single();

    if (imageError || !imageRecord) {
      console.error("Image record not found or database error:", imageError);
      return new Response(JSON.stringify({ error: "Image not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🛡️ Ensure user owns the image (this step depends on your data model)
    const { data: messageRecord, error: messageError } = await supabase
      .from("chat_messages")
      .select("user_id")
      .eq("id", imageRecord.message_id)
      .single();

    if (messageError || !messageRecord || messageRecord.user_id !== userId) {
      console.error("User does not have access to this image");
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🌎 Step 3: Fetch the image from OpenAI
    const imageResponse = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
    });

    if (!imageResponse.ok) {
      console.error(`OpenAI API error: ${imageResponse.status} ${imageResponse.statusText}`);
      return new Response(JSON.stringify({ 
        error: `Failed to fetch image from OpenAI: ${imageResponse.status} ${imageResponse.statusText}` 
      }), { 
        status: imageResponse.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 🖼️ Step 4: Stream the Image Data (Memory Efficient)
    return new Response(imageResponse.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": imageResponse.headers.get("content-type") || "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });

  } catch (error) {
    console.error("Error serving image:", error);

    return new Response(JSON.stringify({ 
      error: "Failed to serve image: " + (error.message || "Unknown error") 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
