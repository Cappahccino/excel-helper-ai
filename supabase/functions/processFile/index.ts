
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configure CORS headers for cross-origin access
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Process the request
serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }
  
  try {
    // Get request parameters
    const { fileId, workflowId, nodeId, sheetName } = await req.json();

    // Validate required parameters
    if (!fileId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing fileId parameter" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Create a Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    console.log(`Processing file ${fileId} for workflow ${workflowId}, node ${nodeId}, sheet: ${sheetName || 'all'}`);

    // If workflowId is provided, associate file with workflow
    if (workflowId && nodeId) {
      try {
        // Check if the file is already associated
        const { data: existingAssociation } = await supabaseClient
          .from('workflow_files')
          .select('id')
          .eq('workflow_id', workflowId)
          .eq('node_id', nodeId)
          .eq('file_id', fileId)
          .maybeSingle();

        // If the association doesn't exist, create it
        if (!existingAssociation) {
          const { error: associationError } = await supabaseClient.rpc(
            'associate_file_with_workflow_node',
            {
              p_file_id: fileId,
              p_workflow_id: workflowId,
              p_node_id: nodeId
            }
          );

          if (associationError) {
            console.error("Error associating file with workflow:", associationError);
            // Continue processing even if association fails
          } else {
            console.log(`Successfully associated file ${fileId} with workflow ${workflowId}, node ${nodeId}`);
          }
        } else {
          console.log(`File ${fileId} already associated with workflow ${workflowId}, node ${nodeId}`);
        }
      } catch (error) {
        console.error("Error checking/creating file association:", error);
        // Continue processing even if association fails
      }
    }

    // Trigger processing by calling verify-storage function
    const verifyResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/verify-storage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          fileIds: [fileId],
          forceRefresh: true,
          detailed: true
        }),
      }
    );

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error("Error verifying file:", errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Verification failed: ${errorText}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Check file status
    const { data: fileData, error: fileError } = await supabaseClient
      .from('excel_files')
      .select('id, processing_status, error_message')
      .eq('id', fileId)
      .single();

    if (fileError) {
      console.error("Error fetching file status:", fileError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch file status: ${fileError.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Return success
    return new Response(
      JSON.stringify({
        success: true,
        fileId,
        status: fileData.processing_status,
        message: fileData.processing_status === 'completed' 
          ? "File processed successfully" 
          : "File processing initiated"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing file:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
