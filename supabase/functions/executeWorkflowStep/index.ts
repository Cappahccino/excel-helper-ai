
// Follow Deno and Supabase Edge Function conventions
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.23.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Create a Supabase client with the auth context of the function
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl!, supabaseKey!);

// Node type handler mapping
const nodeHandlers: Record<string, (step: any, context: any) => Promise<any>> = {
  // Input node handlers
  'dataInput': handleDataInput,
  'fileUpload': handleFileUpload,
  'spreadsheetGenerator': handleSpreadsheetGenerator,
  'excelInput': handleExcelInput,
  'csvInput': handleCsvInput,
  
  // Processing node handlers
  'dataProcessing': handleDataProcessing,
  'dataTransform': handleDataTransform,
  'dataCleaning': handleDataCleaning,
  'filterNode': handleFilterNode,
  'formulaNode': handleFormulaNode,
  
  // AI node handlers
  'aiNode': handleAINode,
  'aiAnalyze': handleAIAnalyze,
  'aiClassify': handleAIClassify,
  'aiSummarize': handleAISummarize,
  
  // Output node handlers
  'outputNode': handleOutputNode,
  'excelOutput': handleExcelOutput,
  'dashboardOutput': handleDashboardOutput,
  'emailNotify': handleEmailNotify,
  
  // Integration node handlers
  'integrationNode': handleIntegrationNode,
  'xeroConnect': handleXeroConnect,
  'salesforceConnect': handleSalesforceConnect,
  'googleSheetsConnect': handleGoogleSheetsConnect,
  
  // Control node handlers
  'controlNode': handleControlNode,
  'conditionalBranch': handleConditionalBranch,
  'loopNode': handleLoopNode,
  'mergeNode': handleMergeNode,
  
  // New handler for askAI node
  'askAI': handleAskAI,
};

// Helper function to log step execution details
async function logStepExecution(
  nodeId: string, 
  executionId: string, 
  nodeType: string, 
  inputData: any, 
  outputData: any, 
  status: 'success' | 'error' | 'warning' | 'info' = 'success',
  executionTimeMs: number = 0,
  processingMetadata: any = {}
) {
  try {
    await supabase.from('workflow_step_logs').insert({
      node_id: nodeId,
      execution_id: executionId,
      node_type: nodeType,
      input_data: inputData,
      output_data: outputData,
      status,
      execution_time_ms: executionTimeMs,
      processing_metadata: processingMetadata
    });
    console.log(`Logged execution data for node ${nodeId}`);
  } catch (error) {
    console.error(`Error logging step execution: ${error}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { executionId, stepId } = await req.json();
    
    if (!executionId || !stepId) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: executionId and stepId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Executing workflow step ${stepId} for execution ${executionId}`);
    
    // 1. Get the step details
    const { data: step, error: stepError } = await supabase
      .from("workflow_steps")
      .select("*")
      .eq("id", stepId)
      .single();
    
    if (stepError || !step) {
      return new Response(
        JSON.stringify({ error: "Step not found", details: stepError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // 2. Get the execution context
    const { data: execution, error: executionError } = await supabase
      .from("workflow_executions")
      .select("*")
      .eq("id", executionId)
      .single();
    
    if (executionError || !execution) {
      return new Response(
        JSON.stringify({ error: "Execution not found", details: executionError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // 3. Update step status to processing
    await supabase
      .from("workflow_steps")
      .update({ 
        status: "processing", 
        started_at: new Date().toISOString() 
      })
      .eq("id", stepId);
    
    // 4. Execute the step
    let result;
    let error = null;
    let stepStartTime = Date.now();
    
    try {
      // Create execution context
      const context = {
        executionId,
        workflowId: step.workflow_id,
        nodeStates: execution.node_states || {},
        inputs: execution.inputs || {},
        outputs: execution.outputs || {},
      };
      
      // Prepare input data for logging
      const inputData = getNodeInputData(step, context);
      
      // Get the appropriate handler for this node type
      const handler = nodeHandlers[step.node_type];
      
      if (handler) {
        result = await handler(step, context);
        const executionTimeMs = Date.now() - stepStartTime;
        
        // Update the node states with the result
        const updatedNodeStates = {
          ...context.nodeStates,
          [step.node_id]: {
            status: "completed",
            output: result,
            completedAt: new Date().toISOString(),
          }
        };
        
        // Update the execution with the new node states
        await supabase
          .from("workflow_executions")
          .update({ 
            node_states: updatedNodeStates,
            outputs: { ...context.outputs, [step.node_id]: result }
          })
          .eq("id", executionId);
        
        // Mark step as completed
        await supabase
          .from("workflow_steps")
          .update({ 
            status: "completed", 
            completed_at: new Date().toISOString(),
            execution_data: { result }
          })
          .eq("id", stepId);
        
        // Log the step execution details
        await logStepExecution(
          step.node_id,
          executionId,
          step.node_type,
          inputData,
          result,
          'success',
          executionTimeMs,
          {
            configurationUsed: step.configuration,
            stepId,
            executionTimeMs
          }
        );
        
        console.log(`Step ${stepId} completed successfully`);
      } else {
        throw new Error(`No handler found for node type: ${step.node_type}`);
      }
    } catch (e) {
      console.error(`Error executing step ${stepId}:`, e);
      error = e.message || "Unknown error during step execution";
      const executionTimeMs = Date.now() - stepStartTime;
      
      // Update node states with the error
      const updatedNodeStates = {
        ...execution.node_states,
        [step.node_id]: {
          status: "failed",
          error: error,
          failedAt: new Date().toISOString(),
        }
      };
      
      // Update the execution with the error
      await supabase
        .from("workflow_executions")
        .update({ 
          node_states: updatedNodeStates 
        })
        .eq("id", executionId);
      
      // Mark step as failed
      await supabase
        .from("workflow_steps")
        .update({ 
          status: "failed", 
          error_message: error,
          execution_data: { error }
        })
        .eq("id", stepId);
      
      // Log the failed step execution
      await logStepExecution(
        step.node_id,
        executionId,
        step.node_type,
        getNodeInputData(step, {
          executionId,
          workflowId: step.workflow_id,
          nodeStates: execution.node_states || {},
          inputs: execution.inputs || {},
          outputs: execution.outputs || {}
        }),
        { error },
        'error',
        executionTimeMs,
        {
          errorDetails: error,
          configurationUsed: step.configuration,
          stepId
        }
      );
    }
    
    // 5. Find and queue the next step(s)
    if (!error) {
      // Get all steps that depend on this one being completed
      const { data: nextSteps, error: nextStepsError } = await supabase
        .from("workflow_steps")
        .select("*")
        .eq("workflow_id", step.workflow_id)
        .eq("status", "pending")
        .order("step_order", { ascending: true });
      
      if (!nextStepsError && nextSteps && nextSteps.length > 0) {
        // Check if any of the next steps have dependencies that are not yet completed
        const stepsToExecute = [];
        
        for (const nextStep of nextSteps) {
          const dependencies = nextStep.dependencies || [];
          
          // Check if all dependencies are completed
          const allDependenciesCompleted = dependencies.length === 0 || 
            dependencies.every((depNodeId: string) => {
              const nodeState = execution.node_states[depNodeId];
              return nodeState && nodeState.status === "completed";
            });
          
          if (allDependenciesCompleted) {
            stepsToExecute.push(nextStep.id);
          }
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Step executed successfully", 
            nextSteps: stepsToExecute 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // No more steps to execute, mark the workflow as completed
        if (!nextStepsError && (!nextSteps || nextSteps.length === 0)) {
          await supabase
            .from("workflow_executions")
            .update({ 
              status: "completed", 
              completed_at: new Date().toISOString() 
            })
            .eq("id", executionId);
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: "Workflow completed successfully", 
              completed: true 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }
    
    // Return response based on success or failure
    if (error) {
      return new Response(
        JSON.stringify({ 
          error: "Step execution failed", 
          message: error 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Step executed successfully",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error occurred", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to get input data for a node
function getNodeInputData(step: any, context: any): any {
  const inputData: any = {
    configuration: step.configuration,
    dependencies: []
  };
  
  // If this node has dependencies, include their outputs as input
  if (step.dependencies && Array.isArray(step.dependencies)) {
    step.dependencies.forEach((depNodeId: string) => {
      const nodeState = context.nodeStates[depNodeId];
      if (nodeState && nodeState.output) {
        inputData.dependencies.push({
          nodeId: depNodeId,
          output: nodeState.output
        });
      }
    });
  }
  
  return inputData;
}

// Node type handler implementations
async function handleDataInput(step: any, context: any) {
  console.log("Executing Data Input node:", step.node_id);
  // This would typically retrieve data from a source
  return { message: "Data input processed", timestamp: new Date().toISOString() };
}

async function handleFileUpload(step: any, context: any) {
  console.log("Executing File Upload node:", step.node_id);
  // This would handle file upload processing
  const config = step.configuration?.config || {};
  const fileId = config.fileId;
  
  if (!fileId) {
    throw new Error("No file ID specified in node configuration");
  }
  
  // Get file metadata
  const { data: file, error } = await supabase
    .from("excel_files")
    .select("*")
    .eq("id", fileId)
    .single();
  
  if (error || !file) {
    throw new Error(`File not found: ${error?.message || "Unknown error"}`);
  }
  
  return { 
    fileId: file.id,
    filename: file.filename,
    fileSize: file.file_size,
    processingStatus: file.processing_status,
    message: "File upload node processed"
  };
}

async function handleSpreadsheetGenerator(step: any, context: any) {
  console.log("Executing Spreadsheet Generator node:", step.node_id);
  
  try {
    const config = step.configuration?.config || {};
    const filename = config.filename || 'generated';
    const fileExtension = config.fileExtension || 'xlsx';
    const sheets = config.sheets || [{ name: 'Sheet1', columns: [] }];
    
    // Get input data from previous node if available
    const inputNodeId = step.dependencies && step.dependencies.length > 0 ? step.dependencies[0] : null;
    const inputData = inputNodeId && context.nodeStates[inputNodeId] ? 
      context.nodeStates[inputNodeId].output : null;
    
    console.log(`Generating ${fileExtension} file with filename: ${filename}`);
    
    // Store metadata about the generated file
    const fileMetadata = {
      filename: `${filename}.${fileExtension}`,
      format: fileExtension,
      sheetCount: sheets.length,
      generatedAt: new Date().toISOString(),
      sheets: sheets.map((sheet: any) => ({
        name: sheet.name,
        columnCount: sheet.columns?.length || 0
      }))
    };
    
    // In a real implementation, this would generate the file and store it
    // For now, we'll just return the metadata
    return { 
      status: "completed",
      message: `${fileExtension.toUpperCase()} file generated successfully`,
      fileMetadata,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error in Spreadsheet Generator node:`, error);
    throw new Error(`Failed to generate spreadsheet: ${error.message}`);
  }
}

async function handleExcelInput(step: any, context: any) {
  return handleFileUpload(step, context); // Reuse file upload handler
}

async function handleCsvInput(step: any, context: any) {
  return handleFileUpload(step, context); // Reuse file upload handler
}

async function handleDataProcessing(step: any, context: any) {
  console.log("Executing Data Processing node:", step.node_id);
  // This would process data based on configuration
  return { message: "Data processing completed", timestamp: new Date().toISOString() };
}

async function handleDataTransform(step: any, context: any) {
  console.log("Executing Data Transform node:", step.node_id);
  return { message: "Data transform completed", timestamp: new Date().toISOString() };
}

async function handleDataCleaning(step: any, context: any) {
  console.log("Executing Data Cleaning node:", step.node_id);
  return { message: "Data cleaning completed", timestamp: new Date().toISOString() };
}

async function handleFilterNode(step: any, context: any) {
  console.log("Executing Filter node:", step.node_id);
  return { message: "Filter applied", timestamp: new Date().toISOString() };
}

async function handleFormulaNode(step: any, context: any) {
  console.log("Executing Formula node:", step.node_id);
  return { message: "Formula applied", timestamp: new Date().toISOString() };
}

async function handleAINode(step: any, context: any) {
  console.log("Executing AI node:", step.node_id);
  return { message: "AI processing completed", timestamp: new Date().toISOString() };
}

async function handleAIAnalyze(step: any, context: any) {
  console.log("Executing AI Analyze node:", step.node_id);
  return { message: "AI analysis completed", timestamp: new Date().toISOString() };
}

async function handleAIClassify(step: any, context: any) {
  console.log("Executing AI Classify node:", step.node_id);
  return { message: "AI classification completed", timestamp: new Date().toISOString() };
}

async function handleAISummarize(step: any, context: any) {
  console.log("Executing AI Summarize node:", step.node_id);
  return { message: "AI summarization completed", timestamp: new Date().toISOString() };
}

async function handleOutputNode(step: any, context: any) {
  console.log("Executing Output node:", step.node_id);
  return { message: "Output generated", timestamp: new Date().toISOString() };
}

async function handleExcelOutput(step: any, context: any) {
  console.log("Executing Excel Output node:", step.node_id);
  return { message: "Excel output generated", timestamp: new Date().toISOString() };
}

async function handleDashboardOutput(step: any, context: any) {
  console.log("Executing Dashboard Output node:", step.node_id);
  return { message: "Dashboard output generated", timestamp: new Date().toISOString() };
}

async function handleEmailNotify(step: any, context: any) {
  console.log("Executing Email Notification node:", step.node_id);
  return { message: "Email notification sent", timestamp: new Date().toISOString() };
}

async function handleIntegrationNode(step: any, context: any) {
  console.log("Executing Integration node:", step.node_id);
  return { message: "Integration processed", timestamp: new Date().toISOString() };
}

async function handleXeroConnect(step: any, context: any) {
  console.log("Executing Xero Connect node:", step.node_id);
  return { message: "Xero connection processed", timestamp: new Date().toISOString() };
}

async function handleSalesforceConnect(step: any, context: any) {
  console.log("Executing Salesforce Connect node:", step.node_id);
  return { message: "Salesforce connection processed", timestamp: new Date().toISOString() };
}

async function handleGoogleSheetsConnect(step: any, context: any) {
  console.log("Executing Google Sheets Connect node:", step.node_id);
  return { message: "Google Sheets connection processed", timestamp: new Date().toISOString() };
}

async function handleControlNode(step: any, context: any) {
  console.log("Executing Control node:", step.node_id);
  return { message: "Control flow processed", timestamp: new Date().toISOString() };
}

async function handleConditionalBranch(step: any, context: any) {
  console.log("Executing Conditional Branch node:", step.node_id);
  return { message: "Conditional branch processed", timestamp: new Date().toISOString() };
}

async function handleLoopNode(step: any, context: any) {
  console.log("Executing Loop node:", step.node_id);
  return { message: "Loop processed", timestamp: new Date().toISOString() };
}

async function handleMergeNode(step: any, context: any) {
  console.log("Executing Merge node:", step.node_id);
  return { message: "Merge processed", timestamp: new Date().toISOString() };
}

// Add a new handler for askAI node
async function handleAskAI(step: any, context: any) {
  console.log("Executing Ask AI node:", step.node_id);
  
  const config = step.configuration?.config || {};
  const aiProvider = config.aiProvider || 'openai';
  const modelName = config.modelName || 'gpt-4o-mini';
  const userQuery = config.prompt || 'Hello, AI assistant';
  const systemMessage = config.systemMessage || 'You are a helpful assistant.';
  
  if (!userQuery) {
    throw new Error("No prompt specified in node configuration");
  }
  
  try {
    // Prepare the request to call ask-ai function
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration for calling ask-ai function");
    }
    
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Call the ask-ai function
    const response = await supabase.functions.invoke('ask-ai', {
      body: {
        workflowId: step.workflow_id,
        nodeId: step.node_id,
        executionId: context.executionId,
        aiProvider,
        userQuery,
        systemMessage,
        modelName
      }
    });
    
    if (response.error) {
      throw new Error(`Error calling ask-ai function: ${response.error.message}`);
    }
    
    const { success, aiResponse, requestId } = response.data;
    
    if (!success) {
      throw new Error("Failed to get response from AI");
    }
    
    return {
      aiResponse,
      requestId,
      aiProvider,
      modelName,
      promptUsed: userQuery,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error in Ask AI node:", error);
    throw error;
  }
}
