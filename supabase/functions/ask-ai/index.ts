
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

const corsHeadersObject = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeadersObject, status: 204 });
  }

  try {
    // Get the request body
    const requestData = await req.json();
    const { 
      workflowId, 
      nodeId, 
      executionId, 
      aiProvider, 
      userQuery, 
      systemMessage, 
      modelName 
    } = requestData;

    // Validate required fields
    if (!workflowId || !nodeId || !executionId || !aiProvider || !userQuery) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Missing required fields" 
        }),
        { headers: { ...corsHeadersObject, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Validate AI provider
    if (!['openai', 'anthropic', 'deepseek'].includes(aiProvider)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid AI provider" 
        }),
        { headers: { ...corsHeadersObject, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create a record in the workflow_ai_requests table
    const { data: aiRequest, error: insertError } = await supabase
      .from("workflow_ai_requests")
      .insert({
        workflow_id: workflowId,
        node_id: nodeId,
        execution_id: executionId,
        ai_provider: aiProvider,
        user_query: userQuery,
        system_message: systemMessage,
        model_name: modelName,
        status: "processing"
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error creating AI request:", insertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create AI request record"
        }),
        { headers: { ...corsHeadersObject, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const requestId = aiRequest.id;

    // For now, just simulate an AI response
    // In production, this would call the actual AI provider APIs
    const simulatedResponse = `This is a simulated response to your query: "${userQuery}"`;
    
    // Update the AI request with the response
    const { error: updateError } = await supabase
      .from("workflow_ai_requests")
      .update({
        ai_response: simulatedResponse,
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", requestId);

    if (updateError) {
      console.error("Error updating AI request:", updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to update AI request with response"
        }),
        { headers: { ...corsHeadersObject, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Return the AI response
    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        aiResponse: simulatedResponse
      }),
      { headers: { ...corsHeadersObject, "Content-Type": "application/json" }, status: 200 }
    );
    
  } catch (error) {
    console.error("Error in ask-ai function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error occurred"
      }),
      { headers: { ...corsHeadersObject, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
