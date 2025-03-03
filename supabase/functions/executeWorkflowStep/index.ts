
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

// Process a workflow step based on its type
async function processStep(step: any, fileId: string) {
  console.log(`Processing step: ${step.node_type}, action: ${step.action_type}`);
  
  // Parse input data
  let inputData = {};
  try {
    inputData = typeof step.input_data === 'string' 
      ? JSON.parse(step.input_data) 
      : (step.input_data || {});
  } catch (error) {
    console.warn("Could not parse input_data:", error);
  }
  
  // Different processing based on node type and action type
  if (step.node_category === 'ai') {
    return await processAIStep(step, fileId, inputData);
  } else if (step.node_category === 'processing') {
    return await processDataTransformStep(step, fileId, inputData);
  } else if (step.node_category === 'output') {
    return await processOutputStep(step, fileId, inputData);
  } else {
    // Default simple processing
    return {
      success: true,
      data: { message: `Processed ${step.node_type} step`, fileId }
    };
  }
}

// Process AI-related steps
async function processAIStep(step: any, fileId: string, inputData: any) {
  console.log(`Processing AI step: ${step.node_type}`);
  
  // Simulate AI processing
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return {
    success: true,
    data: {
      summary: "This is an AI-generated summary of the data.",
      insights: [
        "The data shows an upward trend.",
        "There are 3 outliers in the dataset.",
        "The correlation coefficient is 0.85."
      ],
      fileId
    }
  };
}

// Process data transformation steps
async function processDataTransformStep(step: any, fileId: string, inputData: any) {
  console.log(`Processing data transformation step: ${step.node_type}`);
  
  // Simulate data transformation
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    success: true,
    data: {
      transformedData: "Data has been transformed according to rules",
      rowsProcessed: 150,
      columnsProcessed: 10,
      fileId
    }
  };
}

// Process output steps
async function processOutputStep(step: any, fileId: string, inputData: any) {
  console.log(`Processing output step: ${step.node_type}`);
  
  // Simulate output generation
  await new Promise(resolve => setTimeout(resolve, 800));
  
  return {
    success: true,
    data: {
      outputType: "excel",
      outputLocation: "exports/report.xlsx",
      generatedAt: new Date().toISOString(),
      fileId
    }
  };
}

// Handle requests
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Parse the request body
    const { stepId, workflowId, fileId } = await req.json();
    
    if (!stepId || !workflowId) {
      return new Response(
        JSON.stringify({ error: "stepId and workflowId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`Executing workflow step ${stepId} for workflow ${workflowId}`);
    
    // Get step details
    const { data: step, error: stepError } = await supabase
      .from('workflow_steps')
      .select('*')
      .eq('id', stepId)
      .single();
    
    if (stepError || !step) {
      console.error("Error fetching step:", stepError);
      return new Response(
        JSON.stringify({ error: "Step not found", details: stepError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Make sure step status is 'processing'
    if (step.status !== 'processing') {
      await supabase
        .from('workflow_steps')
        .update({
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('id', stepId);
    }
    
    try {
      // Process the step
      const result = await processStep(step, fileId);
      
      // Update step status to completed with output data
      await supabase
        .from('workflow_steps')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data: result.data
        })
        .eq('id', stepId);
      
      console.log(`Step ${stepId} completed successfully`);
      
      // Get the next step
      const { data: nextSteps, error: nextStepsError } = await supabase
        .from('workflow_steps')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('status', 'pending')
        .order('step_order', { ascending: true })
        .limit(1);
      
      if (!nextStepsError && nextSteps && nextSteps.length > 0) {
        // Queue the next step
        const nextStep = nextSteps[0];
        
        // Update next step to processing
        await supabase
          .from('workflow_steps')
          .update({
            status: 'processing',
            started_at: new Date().toISOString(),
            input_data: {
              ...result.data,
              previousStepId: stepId
            }
          })
          .eq('id', nextStep.id);
        
        console.log(`Next step ${nextStep.id} queued for processing`);
        
        // Trigger the next step
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
        console.log(`Workflow ${workflowId} has no more steps to process`);
        
        await supabase
          .from('workflow_executions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            outputs: { finalResult: result.data }
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
      
      return new Response(
        JSON.stringify({
          success: true,
          message: "Step executed successfully",
          data: result.data
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error processing step:", error);
      
      // Update step status to failed
      await supabase
        .from('workflow_steps')
        .update({
          status: 'failed',
          error_message: error.message || "Unknown error during step execution"
        })
        .eq('id', stepId);
      
      // Mark workflow execution as failed
      await supabase
        .from('workflow_executions')
        .update({
          status: 'failed',
          error: error.message || "Step execution failed"
        })
        .eq('workflow_id', workflowId);
      
      // Update workflow last run status
      await supabase
        .from('workflows')
        .update({
          last_run_status: 'failed'
        })
        .eq('id', workflowId);
      
      return new Response(
        JSON.stringify({
          error: "Step execution failed",
          details: error.message
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
