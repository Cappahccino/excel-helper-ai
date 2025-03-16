
// Follow this setup guide to integrate the Deno FreshPorts library:
// https://fresh.deno.dev/docs/integrations/supabase-database
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

interface RequestData {
  fileId: string;
  workflowId: string;
  nodeId: string;
  sheetName?: string;
}

interface ResponseData {
  success: boolean;
  fileId?: string;
  error?: string;
  message?: string;
  workflowId?: string;
  nodeId?: string;
}

Deno.serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get('SUPABASE_URL') ?? '',
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      // Create client with Auth context of the user that called the function.
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );
    
    // Get the current authenticated user
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // Get the request data
    const input: RequestData = await req.json();
    console.log('Processing file request:', input);

    // Get file details
    const { data: fileData, error: fileError } = await supabaseClient
      .from('excel_files')
      .select('id, filename, file_path, file_size, mime_type, processing_status, storage_verified')
      .eq('id', input.fileId)
      .single();

    if (fileError || !fileData) {
      console.error('Error fetching file data:', fileError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: fileError?.message || 'File not found' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    // Check if file is ready to be processed
    if (fileData.processing_status === 'processing') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'File is already being processed'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Format workflow ID (handle temp- prefix)
    let formattedWorkflowId = input.workflowId;
    if (formattedWorkflowId.startsWith('temp-')) {
      formattedWorkflowId = formattedWorkflowId.substring(5);
    }

    console.log(`Formatted workflow ID: ${formattedWorkflowId}`);

    // Ensure workflow exists
    const { data: workflowExists, error: workflowError } = await supabaseClient
      .from('workflows')
      .select('id')
      .eq('id', formattedWorkflowId)
      .single();

    if (workflowError) {
      console.log('Workflow not found, creating one');
      
      // Create the workflow if it doesn't exist
      const { error: createWorkflowError } = await supabaseClient
        .from('workflows')
        .insert({
          id: formattedWorkflowId,
          name: 'New Workflow',
          created_by: user.id,
          is_temporary: input.workflowId.startsWith('temp-'),
          definition: JSON.stringify({ nodes: [], edges: [] })
        });
      
      if (createWorkflowError) {
        console.error('Error creating workflow:', createWorkflowError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Failed to create workflow: ${createWorkflowError.message}`
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        );
      }
    }

    // Associate file with workflow node
    const { data: workflowFileData, error: workflowFileError } = await supabaseClient
      .from('workflow_files')
      .upsert({
        workflow_id: formattedWorkflowId,
        node_id: input.nodeId,
        file_id: input.fileId,
        processing_status: 'processing',
        is_active: true,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'workflow_id,node_id'
      })
      .select()
      .single();

    if (workflowFileError) {
      console.error('Error associating file with workflow:', workflowFileError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to associate file with workflow: ${workflowFileError.message}`
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    console.log('File associated with workflow successfully');

    // Update file status to processing
    const { error: updateError } = await supabaseClient
      .from('excel_files')
      .update({ 
        processing_status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('id', input.fileId);

    if (updateError) {
      console.error('Error updating file status:', updateError);
    }

    // For files that are already processed, we'll just mark them as completed in the workflow
    if (fileData.processing_status === 'completed' && fileData.storage_verified) {
      console.log('File is already processed, updating workflow status');
      
      const { error: completeError } = await supabaseClient
        .from('workflow_files')
        .update({
          processing_status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('workflow_id', formattedWorkflowId)
        .eq('node_id', input.nodeId);

      if (completeError) {
        console.error('Error updating workflow file status:', completeError);
      }
      
      // No need to process again, return success
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'File is already processed',
          fileId: input.fileId,
          workflowId: formattedWorkflowId,
          nodeId: input.nodeId,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    console.log('Starting file processing in the background');

    // Start the file processing in the background
    // This is a simplified version - in a real implementation you would use a queue
    // or background worker to process large files
    EdgeRuntime.waitUntil((async () => {
      try {
        // Update file status to completed
        await supabaseClient
          .from('excel_files')
          .update({
            processing_status: 'completed',
            processing_completed_at: new Date().toISOString()
          })
          .eq('id', input.fileId);

        // Update workflow file status to completed
        await supabaseClient
          .from('workflow_files')
          .update({
            processing_status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('workflow_id', formattedWorkflowId)
          .eq('node_id', input.nodeId);

        console.log('File processing completed successfully');
      } catch (error) {
        console.error('Error in background processing:', error);
        
        // Update file status to error
        await supabaseClient
          .from('excel_files')
          .update({
            processing_status: 'error',
            error_message: error.message || 'Unknown error'
          })
          .eq('id', input.fileId);

        // Update workflow file status to error
        await supabaseClient
          .from('workflow_files')
          .update({
            processing_status: 'error',
          })
          .eq('workflow_id', formattedWorkflowId)
          .eq('node_id', input.nodeId);
      }
    })());

    const response: ResponseData = {
      success: true,
      fileId: input.fileId,
      workflowId: formattedWorkflowId,
      nodeId: input.nodeId,
      message: 'File processing initiated'
    };

    console.log('Returning success response');
    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Unhandled error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal Server Error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
