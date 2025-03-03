
const { Worker, Queue } = require("bullmq");
const Redis = require("ioredis");
const { createClient } = require("@supabase/supabase-js");
const XLSX = require('xlsx');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require("dotenv").config();

// Initialize Redis and Supabase clients
const redis = new Redis(process.env.REDIS_URL);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Create workflow queue
const workflowQueue = new Queue("workflow-processing", { connection: redis });

// Worker to process files
const fileWorker = new Worker(
  "file-processing",
  async (job) => {
    const { fileId, workflowId, executionId } = job.data;
    
    console.log(`Processing file ${fileId} ${workflowId ? `for workflow ${workflowId}` : ''}`);
    
    try {
      // Update file status to processing
      await supabase
        .from('excel_files')
        .update({ processing_status: 'processing', processing_started_at: new Date().toISOString() })
        .eq('id', fileId);
      
      // Fetch the file data from Supabase
      const { data: fileData, error: fileError } = await supabase
        .from('excel_files')
        .select('*')
        .eq('id', fileId)
        .single();
      
      if (fileError || !fileData) {
        throw new Error(`File not found: ${fileError?.message || 'Unknown error'}`);
      }
      
      // File path would be in fileData.file_path
      // Simulating file processing
      console.log(`Reading file from path: ${fileData.file_path}`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing
      
      // Update file status to completed
      await supabase
        .from('excel_files')
        .update({
          processing_status: 'completed',
          processing_completed_at: new Date().toISOString()
        })
        .eq('id', fileId);
      
      // If this is part of a workflow, process the next step
      if (workflowId) {
        console.log(`Queuing next step for workflow ${workflowId}`);
        await workflowQueue.add("workflow-step", { 
          fileId, 
          workflowId,
          executionId,
          previousStep: 'file-processing'
        });
      }
      
      return { success: true, fileId };
    } catch (error) {
      console.error(`Error processing file ${fileId}:`, error);
      
      // Update file status to failed
      await supabase
        .from('excel_files')
        .update({
          processing_status: 'failed',
          error_message: error.message || 'Unknown error during processing'
        })
        .eq('id', fileId);
      
      // If this is part of a workflow, mark the execution as failed
      if (workflowId && executionId) {
        await supabase
          .from('workflow_executions')
          .update({
            status: 'failed',
            error: error.message || 'File processing failed'
          })
          .eq('id', executionId);
        
        // Update workflow status
        await supabase
          .from('workflows')
          .update({
            last_run_status: 'failed'
          })
          .eq('id', workflowId);
      }
      
      throw error;
    }
  },
  { connection: redis }
);

// Worker to process workflow steps
const workflowStepWorker = new Worker(
  "workflow-step",
  async (job) => {
    const { fileId, workflowId, executionId, previousStep } = job.data;
    
    console.log(`Processing workflow step for workflow ${workflowId}`);
    
    try {
      // Get the next pending step
      const { data: steps, error: stepsError } = await supabase
        .from('workflow_steps')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('status', 'pending')
        .order('step_order', { ascending: true })
        .limit(1);
      
      if (stepsError) {
        throw new Error(`Error fetching workflow steps: ${stepsError.message}`);
      }
      
      if (!steps || steps.length === 0) {
        console.log(`No pending steps for workflow ${workflowId}, marking as completed`);
        
        // No more steps, mark workflow execution as completed
        await supabase
          .from('workflow_executions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', executionId);
        
        // Update workflow status
        await supabase
          .from('workflows')
          .update({
            last_run_status: 'completed'
          })
          .eq('id', workflowId);
        
        return { success: true, message: 'Workflow completed' };
      }
      
      const currentStep = steps[0];
      console.log(`Processing step ${currentStep.step_order}: ${currentStep.node_type}`);
      
      // Update step status to processing
      await supabase
        .from('workflow_steps')
        .update({
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('id', currentStep.id);
      
      // Process step based on node type and category
      let result;
      switch (currentStep.node_category) {
        case 'input':
          result = await processInputStep(currentStep, fileId);
          break;
        case 'processing':
          result = await processDataStep(currentStep, fileId);
          break;
        case 'ai':
          result = await processAIStep(currentStep, fileId);
          break;
        case 'output':
          result = await processOutputStep(currentStep, fileId);
          break;
        default:
          result = { success: true, message: `Processed ${currentStep.node_type} step` };
      }
      
      // Update step status to completed
      await supabase
        .from('workflow_steps')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data: result
        })
        .eq('id', currentStep.id);
      
      console.log(`Step ${currentStep.id} completed`);
      
      // Queue next step
      await workflowQueue.add("workflow-step", {
        fileId,
        workflowId,
        executionId,
        previousStep: currentStep.id
      });
      
      return result;
    } catch (error) {
      console.error(`Error processing workflow step for ${workflowId}:`, error);
      
      // Find the current processing step
      const { data: processingSteps } = await supabase
        .from('workflow_steps')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('status', 'processing');
      
      // Mark any processing steps as failed
      if (processingSteps && processingSteps.length > 0) {
        for (const step of processingSteps) {
          await supabase
            .from('workflow_steps')
            .update({
              status: 'failed',
              error_message: error.message || 'Step processing failed'
            })
            .eq('id', step.id);
        }
      }
      
      // Mark workflow execution as failed
      if (executionId) {
        await supabase
          .from('workflow_executions')
          .update({
            status: 'failed',
            error: error.message || 'Step processing failed'
          })
          .eq('id', executionId);
      }
      
      // Update workflow status
      await supabase
        .from('workflows')
        .update({
          last_run_status: 'failed'
        })
        .eq('id', workflowId);
      
      throw error;
    }
  },
  { connection: redis }
);

// Process input steps (like file upload)
async function processInputStep(step, fileId) {
  console.log(`Processing input step: ${step.node_type}`);
  
  // Handle different input step types
  if (step.node_type === 'fileUpload') {
    // The file is already uploaded and processed before this step
    return {
      success: true,
      fileId,
      message: 'File uploaded and processed'
    };
  }
  
  // Default generic processing
  return {
    success: true,
    fileId,
    message: `Processed ${step.node_type} input step`
  };
}

// Process data transformation steps
async function processDataStep(step, fileId) {
  console.log(`Processing data transformation step: ${step.node_type}`);
  
  // Simulate data processing
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return {
    success: true,
    fileId,
    transformedRows: 150,
    message: 'Data transformation completed'
  };
}

// Process AI/ML steps
async function processAIStep(step, fileId) {
  console.log(`Processing AI step: ${step.node_type}`);
  
  // Simulate AI processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return {
    success: true,
    fileId,
    insights: [
      'Detected an upward trend in Q4 sales',
      'Found 3 outliers in the dataset',
      'Sentiment analysis reveals positive customer feedback'
    ],
    message: 'AI analysis completed'
  };
}

// Process output steps
async function processOutputStep(step, fileId) {
  console.log(`Processing output step: ${step.node_type}`);
  
  // Simulate output generation
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    success: true,
    fileId,
    outputType: step.node_type === 'excelOutput' ? 'excel' : 'generic',
    generatedAt: new Date().toISOString(),
    message: 'Output generated successfully'
  };
}

// Error handling
fileWorker.on('failed', (job, error) => {
  console.error(`File job ${job.id} failed:`, error);
});

workflowStepWorker.on('failed', (job, error) => {
  console.error(`Workflow step job ${job.id} failed:`, error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await fileWorker.close();
  await workflowStepWorker.close();
  await redis.quit();
});

console.log('File and workflow workers started');
