
// Import necessary modules
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle preflight CORS requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse the request body
    const { fileId, workflowId, nodeId } = await req.json();
    
    if (!fileId || !workflowId || !nodeId) {
      throw new Error("Missing required parameters: fileId, workflowId, and nodeId are required");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get file information
    const { data: file, error: fileError } = await supabase
      .from("excel_files")
      .select("*")
      .eq("id", fileId)
      .single();
      
    if (fileError) {
      throw new Error(`File not found: ${fileError.message}`);
    }
    
    // Verify file exists in storage
    const { data: fileExists, error: fileExistsError } = await supabase.storage
      .from("excel_files") // Make sure this matches the bucket name (case-sensitive)
      .createSignedUrl(file.file_path, 60);
      
    if (fileExistsError) {
      console.error("File existence check error:", fileExistsError);
      
      // Update workflow file status
      await supabase
        .from("workflow_files")
        .update({
          status: "failed",
          metadata: { error: "File not found in storage" }
        })
        .eq("file_id", fileId)
        .eq("workflow_id", workflowId)
        .eq("node_id", nodeId);
      
      throw new Error(`File not found in storage: ${fileExistsError.message}`);
    }
    
    // Update workflow file status to processing
    await supabase
      .from("workflow_files")
      .update({
        status: "processing",
        processing_status: "processing"
      })
      .eq("file_id", fileId)
      .eq("workflow_id", workflowId)
      .eq("node_id", nodeId);
    
    console.log(`File processing queued: ${fileId} for workflow ${workflowId}, node ${nodeId}`);
    
    // Trigger the workflow step execution
    const { error: execError } = await supabase.functions.invoke('executeWorkflowStep', {
      body: {
        workflowId,
        nodeId,
        fileId
      }
    });
    
    if (execError) {
      console.error("Execution error:", execError);
      
      // Update workflow file status
      await supabase
        .from("workflow_files")
        .update({
          status: "failed",
          metadata: { error: execError.message || "Failed to execute workflow step" }
        })
        .eq("file_id", fileId)
        .eq("workflow_id", workflowId)
        .eq("node_id", nodeId);
        
      throw new Error(`Failed to execute workflow step: ${execError.message}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "File processing started",
        fileId,
        workflowId,
        nodeId
      }),
      { 
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        } 
      }
    );
  } catch (error) {
    console.error("Error processing file:", error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        }
      }
    );
  }
});
