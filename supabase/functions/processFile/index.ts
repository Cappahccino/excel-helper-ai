
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Queue, QueueEvents } from "https://esm.sh/bullmq@4";
import { Redis } from "https://esm.sh/@upstash/redis@1.22.0";

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const redisUrl = Deno.env.get("REDIS_URL");
    
    if (!supabaseUrl || !supabaseKey || !redisUrl) {
      throw new Error("Missing required environment variables");
    }
    
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Initialize Redis connection for BullMQ
    const connection = new Redis(redisUrl);
    const fileQueue = new Queue("file-processing", { connection });
    
    // Parse request body
    const { fileId, workflowId, nodeId } = await req.json();
    
    console.log(`Received file processing request for file: ${fileId}`);
    
    if (!fileId) {
      throw new Error("Missing required file ID");
    }
    
    // Get the file details from database
    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single();
      
    if (fileError || !fileData) {
      throw new Error(`File not found: ${fileError?.message || "Unknown error"}`);
    }
    
    // Get the workflow file record
    const { data: workflowFile, error: workflowFileError } = await supabase
      .from('workflow_files')
      .select('*')
      .eq('file_id', fileId)
      .eq('workflow_id', workflowId)
      .single();
      
    if (workflowFileError) {
      console.error("Error fetching workflow file:", workflowFileError);
      // If no record exists, create one
      if (workflowFileError.code === "PGRST116") {
        const { error: insertError } = await supabase
          .from('workflow_files')
          .insert({
            workflow_id: workflowId,
            file_id: fileId,
            node_id: nodeId,
            status: 'queued'
          });
          
        if (insertError) {
          throw new Error(`Failed to create workflow file record: ${insertError.message}`);
        }
      } else {
        throw new Error(`Failed to fetch workflow file: ${workflowFileError.message}`);
      }
    }
    
    // Add the job to the queue
    const jobId = `file-${fileId}-${Date.now()}`;
    await fileQueue.add('process-excel-file', {
      fileId: fileId,
      filePath: fileData.file_path,
      filename: fileData.filename,
      workflowId: workflowId,
      nodeId: nodeId,
      fileSize: fileData.file_size,
      mimeType: fileData.mime_type,
    }, {
      jobId: jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    });
    
    // Update the workflow file status
    await supabase
      .from('workflow_files')
      .update({
        status: 'processing',
        processing_status: 'queued_for_processing'
      })
      .eq('file_id', fileId)
      .eq('workflow_id', workflowId);
    
    console.log(`Job ${jobId} added to queue for file ${fileId}`);
    
    // Return success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "File queued for processing",
        jobId: jobId
      }),
      { 
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        },
        status: 200 
      }
    );
    
  } catch (error) {
    console.error("Error processing file:", error);
    
    // Return error response
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "Unknown error occurred" 
      }),
      { 
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        },
        status: 500 
      }
    );
  }
});
