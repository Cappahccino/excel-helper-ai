import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "https://cdn.jsdelivr.net/npm/openai@4.17.4/+esm";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize OpenAI client
const openaiApiKey = Deno.env.get("OPENAI_API_KEY") || "";
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

// Response headers to ensure proper CORS
const headers = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

// Main serve function for the Edge Function
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    // Extract request data
    const body = await req.json();
    const { fileIds, query, userId, sessionId, threadId, messageId, action } = body;

    if (!fileIds || !fileIds.length) {
      throw new Error("No files provided");
    }

    if (!query) {
      throw new Error("No query provided");
    }

    if (!userId) {
      throw new Error("User ID is required");
    }

    if (!sessionId) {
      throw new Error("Session ID is required");
    }

    if (!messageId) {
      throw new Error("Message ID is required");
    }

    // Your existing excel-assistant function logic...
    console.log("Excel Assistant called with:", {
      fileIds,
      query,
      userId,
      sessionId,
      threadId,
      messageId,
      action
    });

    // This is just a placeholder response - keep your actual implementation
    const response = {
      message: "Excel assistant function called successfully",
      status: "processing",
      details: {
        fileIds,
        query,
        userId,
        sessionId,
        messageId
      }
    };

    return new Response(JSON.stringify(response), { headers });
  } catch (error) {
    console.error("Error in excel-assistant function:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "An error occurred during processing",
      }),
      { headers, status: 400 }
    );
  }
});
