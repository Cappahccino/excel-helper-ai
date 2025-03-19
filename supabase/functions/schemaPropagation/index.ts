
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// Set up CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: corsHeaders,
      status: 204,
    });
  }
  
  try {
    // Parse the request body
    const { action, workflowId, sourceNodeId, targetNodeId, sheetName, 
            nodeId, lastVersion } = await req.json();
    
    // Normalize workflow ID (handle temp- prefix)
    const dbWorkflowId = workflowId?.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
      
    if (!dbWorkflowId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Invalid workflow ID' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Route to the appropriate action handler
    switch (action) {
      case 'propagateSchema':
        return handlePropagateSchema(dbWorkflowId, sourceNodeId, targetNodeId, sheetName);
        
      case 'refreshSchema':
        return handleRefreshSchema(dbWorkflowId, nodeId, sheetName);
        
      case 'checkForSchemaUpdates':
        return handleCheckForUpdates(dbWorkflowId, nodeId, lastVersion, sheetName);
        
      case 'subscribeToSchemaUpdates':
        return handleSubscribeToUpdates(dbWorkflowId, nodeId, sheetName);
        
      case 'unsubscribeFromSchemaUpdates':
        return handleUnsubscribeFromUpdates(dbWorkflowId, nodeId);
        
      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: `Unknown action: ${action}` 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
          }
        );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error.message || 'Internal Server Error',
        error: String(error)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

/**
 * Handle schema propagation from source node to target node
 */
async function handlePropagateSchema(
  workflowId: string, 
  sourceNodeId: string, 
  targetNodeId: string,
  sheetName?: string
) {
  console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId} in workflow ${workflowId}`);
  
  try {
    if (!workflowId || !sourceNodeId || !targetNodeId) {
      throw new Error('Missing required parameters');
    }
    
    // Get source schema
    const { data: sourceSchema, error: sourceError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, file_id, sheet_name')
      .eq('workflow_id', workflowId)
      .eq('node_id', sourceNodeId);
      
    if (sourceError) {
      throw sourceError;
    }
    
    if (!sourceSchema || sourceSchema.length === 0 || !sourceSchema[0].columns) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Source node has no schema' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Find the source schema for the requested sheet
    const effectiveSheetName = sheetName || sourceSchema[0].sheet_name || 'Sheet1';
    
    const matchingSchema = sourceSchema.find(s => s.sheet_name === effectiveSheetName) || sourceSchema[0];
    
    if (!matchingSchema.columns || matchingSchema.columns.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Source node has no schema for sheet ${effectiveSheetName}` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Propagate schema to target node
    const { error: updateError } = await supabase
      .from('workflow_file_schemas')
      .upsert({
        workflow_id: workflowId,
        node_id: targetNodeId,
        file_id: matchingSchema.file_id,
        columns: matchingSchema.columns,
        data_types: matchingSchema.data_types,
        sheet_name: effectiveSheetName,
        updated_at: new Date().toISOString()
      });
      
    if (updateError) {
      throw updateError;
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Schema propagated successfully',
        sheetName: effectiveSheetName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handlePropagateSchema:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error.message || 'Error propagating schema',
        error: String(error)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
}

/**
 * Handle schema refresh for a node
 */
async function handleRefreshSchema(
  workflowId: string, 
  nodeId: string,
  sheetName?: string
) {
  console.log(`Refreshing schema for node ${nodeId} in workflow ${workflowId}`);
  
  try {
    if (!workflowId || !nodeId) {
      throw new Error('Missing required parameters');
    }
    
    // Get the node's schema
    let query = supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, file_id, sheet_name')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId);
      
    if (sheetName) {
      query = query.eq('sheet_name', sheetName);
    }
    
    const { data, error } = await query.maybeSingle();
    
    if (error) {
      throw error;
    }
    
    if (!data || !data.columns) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Node has no schema' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Format schema for response
    const schema = data.columns.map(column => ({
      name: column,
      type: data.data_types[column] || 'unknown'
    }));
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        schema,
        version: Date.now(),
        sheetName: data.sheet_name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handleRefreshSchema:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error.message || 'Error refreshing schema',
        error: String(error)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
}

/**
 * Handle checks for schema updates
 */
async function handleCheckForUpdates(
  workflowId: string, 
  nodeId: string,
  lastVersion?: number,
  sheetName?: string
) {
  console.log(`Checking for schema updates for node ${nodeId} in workflow ${workflowId}`);
  
  try {
    if (!workflowId || !nodeId) {
      throw new Error('Missing required parameters');
    }
    
    // Get the node's schema update timestamp
    let query = supabase
      .from('workflow_file_schemas')
      .select('updated_at, columns, data_types, sheet_name')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId);
      
    if (sheetName) {
      query = query.eq('sheet_name', sheetName);
    }
    
    const { data, error } = await query.maybeSingle();
    
    if (error) {
      throw error;
    }
    
    if (!data) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Node has no schema',
          hasUpdates: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check if schema is newer than the last version the client has
    const currentVersion = new Date(data.updated_at).getTime();
    const hasUpdates = !lastVersion || currentVersion > lastVersion;
    
    if (!hasUpdates) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          hasUpdates: false,
          version: currentVersion
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Format schema for response
    const schema = data.columns.map(column => ({
      name: column,
      type: data.data_types[column] || 'unknown'
    }));
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        hasUpdates: true,
        schema,
        version: currentVersion,
        sheetName: data.sheet_name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handleCheckForUpdates:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error.message || 'Error checking for updates',
        hasUpdates: false,
        error: String(error)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
}

/**
 * Handle subscription to schema updates
 */
async function handleSubscribeToUpdates(
  workflowId: string, 
  nodeId: string,
  sheetName?: string
) {
  console.log(`Setting up subscription for node ${nodeId} in workflow ${workflowId}`);
  
  try {
    // This is just the initial subscription setup
    // Real-time updates will be handled by the Supabase client directly
    
    // Return the current schema as initial data
    let query = supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, sheet_name, updated_at')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId);
      
    if (sheetName) {
      query = query.eq('sheet_name', sheetName);
    }
    
    const { data, error } = await query.maybeSingle();
    
    if (error) {
      throw error;
    }
    
    let schema = null;
    let version = null;
    
    if (data && data.columns) {
      schema = data.columns.map(column => ({
        name: column,
        type: data.data_types[column] || 'unknown'
      }));
      
      version = new Date(data.updated_at).getTime();
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        subscribed: true,
        schema,
        version,
        sheetName: data?.sheet_name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handleSubscribeToUpdates:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error.message || 'Error setting up subscription',
        subscribed: false,
        error: String(error)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
}

/**
 * Handle unsubscription from schema updates
 */
async function handleUnsubscribeFromUpdates(
  workflowId: string, 
  nodeId: string
) {
  console.log(`Unsubscribing from updates for node ${nodeId} in workflow ${workflowId}`);
  
  // Nothing to do on the server for unsubscribe, client handles channel removal
  return new Response(
    JSON.stringify({ 
      success: true, 
      unsubscribed: true
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
