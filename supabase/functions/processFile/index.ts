
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.27.0'

// Define response headers with CORS support
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
}

// Initialize Supabase client with service role key for admin access
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

// Helper function to convert workflow ID format as needed
function normalizeWorkflowId(workflowId: string): string {
  if (workflowId.startsWith('temp-')) {
    return workflowId.substring(5);
  }
  return workflowId;
}

// Server function to handle file processing
async function processFile(fileId: string, workflowId: string, nodeId: string) {
  console.log(`Processing file ${fileId} for workflow ${workflowId}, node ${nodeId}`);
  
  try {
    // Normalize the workflow ID
    const dbWorkflowId = normalizeWorkflowId(workflowId);
    const isTemporary = workflowId.startsWith('temp-');
    
    // Update workflow_files status to processing
    const { error: updateError } = await supabaseAdmin
      .from('workflow_files')
      .update({
        processing_status: 'processing',
        is_temporary: isTemporary
      })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .eq('file_id', fileId);
    
    if (updateError) {
      console.error('Error updating workflow file status:', updateError);
      throw updateError;
    }
    
    // Get file metadata (or create if it doesn't exist)
    const { data: metadata, error: metadataError } = await supabaseAdmin
      .from('file_metadata')
      .select('*')
      .eq('file_id', fileId)
      .maybeSingle();
    
    if (metadataError) {
      console.error('Error fetching file metadata:', metadataError);
      throw metadataError;
    }
    
    // If metadata doesn't exist, create it
    if (!metadata) {
      console.log(`Creating new metadata for file ${fileId}`);
      const { error: createError } = await supabaseAdmin
        .from('file_metadata')
        .insert({
          file_id: fileId,
          row_count: 0,
          column_definitions: {},
          data_summary: {}
        });
      
      if (createError) {
        console.error('Error creating file metadata:', createError);
        throw createError;
      }
    }
    
    // For this example, we'll simulate processing by just setting status to completed
    // In a real implementation, you would process the file and extract schema information
    
    // Short delay to simulate processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update file metadata with simulated data if it doesn't exist
    if (!metadata || !metadata.column_definitions || Object.keys(metadata.column_definitions).length === 0) {
      const { error: updateMetaError } = await supabaseAdmin
        .from('file_metadata')
        .update({
          row_count: 100,
          column_definitions: {
            "id": "string",
            "name": "string",
            "value": "number",
            "date": "date"
          },
          data_summary: {
            "numSheets": 1,
            "totalRows": 100,
            "sheetNames": ["Sheet1"]
          }
        })
        .eq('file_id', fileId);
      
      if (updateMetaError) {
        console.error('Error updating file metadata:', updateMetaError);
        throw updateMetaError;
      }
    }
    
    // Mark workflow file as processed
    const { error: completeError } = await supabaseAdmin
      .from('workflow_files')
      .update({
        processing_status: 'completed',
        processing_result: {
          success: true,
          processed_at: new Date().toISOString()
        }
      })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .eq('file_id', fileId);
    
    if (completeError) {
      console.error('Error completing workflow file processing:', completeError);
      throw completeError;
    }
    
    return { success: true, fileId };
  } catch (error) {
    console.error('Error in processFile function:', error);
    
    // Update status to error
    try {
      const dbWorkflowId = normalizeWorkflowId(workflowId);
      await supabaseAdmin
        .from('workflow_files')
        .update({
          processing_status: 'error',
          processing_result: {
            success: false,
            error: error.message || 'Unknown error',
            error_at: new Date().toISOString()
          }
        })
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .eq('file_id', fileId);
    } catch (updateError) {
      console.error('Error updating error status:', updateError);
    }
    
    return { success: false, error: error.message || 'Unknown processing error' };
  }
}

// Main function to handle the request
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    // Get request body
    const { fileId, workflowId, nodeId } = await req.json();
    
    // Validate required parameters
    if (!fileId) {
      return new Response(
        JSON.stringify({ success: false, error: 'File ID is required' }),
        { headers: corsHeaders, status: 400 }
      );
    }
    
    if (!workflowId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Workflow ID is required' }),
        { headers: corsHeaders, status: 400 }
      );
    }
    
    if (!nodeId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Node ID is required' }),
        { headers: corsHeaders, status: 400 }
      );
    }
    
    // Process the file
    const result = await processFile(fileId, workflowId, nodeId);
    
    return new Response(
      JSON.stringify(result),
      { headers: corsHeaders, status: result.success ? 200 : 500 }
    );
  } catch (error) {
    console.error('Error in processFile edge function:', error);
    
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: corsHeaders, status: 500 }
    );
  }
});
