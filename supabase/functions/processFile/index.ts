
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.23.0";

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseKey);

// Handle requests
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse the request body
    const { fileId, workflowId, executionId } = await req.json();
    
    if (!fileId) {
      return new Response(
        JSON.stringify({ error: "fileId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing file ${fileId} for workflow ${workflowId || 'N/A'}`);

    // Update file status to processing
    const { error: updateError } = await supabase
      .from('excel_files')
      .update({ processing_status: 'processing' })
      .eq('id', fileId);

    if (updateError) {
      console.error("Error updating file status:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update file status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If this is part of a workflow, mark the associated workflow step as processing
    if (workflowId) {
      // Get the first pending step (should be file upload step)
      const { data: steps, error: stepsError } = await supabase
        .from('workflow_steps')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('status', 'pending')
        .order('step_order', { ascending: true })
        .limit(1);

      if (!stepsError && steps && steps.length > 0) {
        const step = steps[0];
        
        // Update step status
        await supabase
          .from('workflow_steps')
          .update({ 
            status: 'processing',
            started_at: new Date().toISOString()
          })
          .eq('id', step.id);
          
        console.log(`Workflow step ${step.id} status updated to processing`);
      }
    }

    // Process the file (you would normally send this to a queue)
    // For now, we'll simulate processing directly
    try {
      // Simulate file processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update file status to completed
      await supabase
        .from('excel_files')
        .update({ 
          processing_status: 'completed',
          processing_completed_at: new Date().toISOString()
        })
        .eq('id', fileId);
      
      // If this is part of a workflow, mark the step as completed and queue the next step
      if (workflowId) {
        // Get the current processing step
        const { data: steps, error: stepsError } = await supabase
          .from('workflow_steps')
          .select('*')
          .eq('workflow_id', workflowId)
          .eq('status', 'processing')
          .order('step_order', { ascending: true })
          .limit(1);
        
        if (!stepsError && steps && steps.length > 0) {
          const step = steps[0];
          
          // Mark step as completed
          await supabase
            .from('workflow_steps')
            .update({ 
              status: 'completed',
              completed_at: new Date().toISOString(),
              output_data: JSON.stringify({ fileId, status: 'success' })
            })
            .eq('id', step.id);
            
          console.log(`Workflow step ${step.id} completed`);
          
          // Get the next step
          const { data: nextSteps, error: nextStepsError } = await supabase
            .from('workflow_steps')
            .select('*')
            .eq('workflow_id', workflowId)
            .eq('status', 'pending')
            .order('step_order', { ascending: true })
            .limit(1);
            
          if (!nextStepsError && nextSteps && nextSteps.length > 0) {
            // There's a next step to process
            const nextStep = nextSteps[0];
            
            // Queue the next step processing (for now we'll just mark it as processing)
            await supabase
              .from('workflow_steps')
              .update({ 
                status: 'processing',
                started_at: new Date().toISOString(),
                input_data: JSON.stringify({ 
                  fileId, 
                  previousStep: step.id 
                })
              })
              .eq('id', nextStep.id);
              
            console.log(`Next workflow step ${nextStep.id} queued for processing`);
            
            // Trigger the actual processing of the next step
            // Here you would typically send a message to a queue
            // For now, we'll just call another edge function
            fetch(`${supabaseUrl}/functions/v1/executeWorkflowStep`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({
                stepId: nextStep.id,
                workflowId,
                fileId
              })
            })
            .catch(error => {
              console.error("Error triggering next step:", error);
            });
          } else {
            // No more steps, mark workflow as completed
            await supabase
              .from('workflow_executions')
              .update({ 
                status: 'completed',
                completed_at: new Date().toISOString()
              })
              .eq('workflow_id', workflowId);
              
            // Update workflow last run status
            await supabase
              .from('workflows')
              .update({ 
                last_run_status: 'completed'
              })
              .eq('id', workflowId);
              
            console.log(`Workflow ${workflowId} completed successfully`);
          }
        }
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "File processed successfully",
          fileId,
          workflowId
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    } catch (error) {
      console.error("Error processing file:", error);
      
      // Update file status to failed
      await supabase
        .from('excel_files')
        .update({ 
          processing_status: 'failed',
          error_message: error.message || "Unknown error during processing"
        })
        .eq('id', fileId);
      
      // If this is part of a workflow, mark the step as failed
      if (workflowId) {
        // Get the current processing step
        const { data: steps } = await supabase
          .from('workflow_steps')
          .select('*')
          .eq('workflow_id', workflowId)
          .eq('status', 'processing')
          .order('step_order', { ascending: true })
          .limit(1);
        
        if (steps && steps.length > 0) {
          const step = steps[0];
          
          // Mark step as failed
          await supabase
            .from('workflow_steps')
            .update({ 
              status: 'failed',
              error_message: error.message || "Unknown error during processing"
            })
            .eq('id', step.id);
            
          // Mark workflow execution as failed
          await supabase
            .from('workflow_executions')
            .update({ 
              status: 'failed',
              error: error.message || "Unknown error during processing"
            })
            .eq('workflow_id', workflowId);
            
          // Update workflow last run status
          await supabase
            .from('workflows')
            .update({ 
              last_run_status: 'failed'
            })
            .eq('id', workflowId);
        }
      }
      
      return new Response(
        JSON.stringify({ 
          error: "File processing failed", 
          details: error.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
  } catch (error) {
    console.error("Request error:", error);
    return new Response(
      JSON.stringify({ error: "Invalid request", details: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
