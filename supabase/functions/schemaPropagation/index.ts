
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(
      supabaseUrl,
      supabaseServiceRoleKey
    );
    
    // Parse request body
    const body = await req.json();
    const { action, workflowId, sourceNodeId, targetNodeId, sheetName } = body;
    
    // Normalize workflow ID
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    console.log(`Processing request for ${action} in workflow ${dbWorkflowId}`);
    
    if (action === 'propagateSchema') {
      // Handle schema propagation from source to target node
      if (!sourceNodeId || !targetNodeId) {
        throw new Error('Missing source or target node ID');
      }
      
      console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId}`);
      
      // 1. Get source schema
      const { data: sourceSchema, error: sourceError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types, file_id, sheet_name')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .eq('sheet_name', sheetName || 'Sheet1')
        .maybeSingle();
        
      if (sourceError) {
        throw new Error(`Error fetching source schema: ${sourceError.message}`);
      }
      
      if (!sourceSchema || !sourceSchema.columns || sourceSchema.columns.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: false,
            message: `Source node ${sourceNodeId} has no schema data`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // 2. Propagate schema to target node
      const { error: targetError } = await supabase
        .from('workflow_file_schemas')
        .upsert({
          workflow_id: dbWorkflowId,
          node_id: targetNodeId,
          file_id: sourceSchema.file_id,
          columns: sourceSchema.columns,
          data_types: sourceSchema.data_types,
          sheet_name: sheetName || sourceSchema.sheet_name || 'Sheet1',
          updated_at: new Date().toISOString()
        });
        
      if (targetError) {
        throw new Error(`Error updating target schema: ${targetError.message}`);
      }
      
      // 3. Broadcast update event
      const schemaVersion = Date.now();
      const channel = supabase.channel(`schema_updates:${dbWorkflowId}:${targetNodeId}`);
      
      await channel.send({
        type: 'broadcast',
        event: 'schema_update',
        payload: {
          workflowId: dbWorkflowId,
          nodeId: targetNodeId,
          schema: sourceSchema.columns.map(col => ({
            name: col,
            type: sourceSchema.data_types[col] || 'unknown'
          })),
          timestamp: Date.now(),
          source: 'propagation',
          version: schemaVersion,
          sheetName: sheetName || sourceSchema.sheet_name || 'Sheet1'
        }
      });
      
      console.log(`Successfully propagated schema from ${sourceNodeId} to ${targetNodeId}`);
      
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Schema propagated successfully',
          version: schemaVersion
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } 
    else if (action === 'getSchema') {
      // Get schema for a specific node
      const nodeId = body.nodeId;
      if (!nodeId) {
        throw new Error('Missing node ID');
      }
      
      const { data: schema, error } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types, file_id, sheet_name')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .eq('sheet_name', sheetName || 'Sheet1')
        .maybeSingle();
        
      if (error) {
        throw new Error(`Error fetching schema: ${error.message}`);
      }
      
      if (!schema || !schema.columns || schema.columns.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: false,
            message: `Node ${nodeId} has no schema data`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const formattedSchema = schema.columns.map(col => ({
        name: col,
        type: schema.data_types[col] || 'unknown'
      }));
      
      return new Response(
        JSON.stringify({ 
          success: true,
          schema: formattedSchema,
          file_id: schema.file_id,
          sheet_name: schema.sheet_name,
          version: Date.now()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    else if (action === 'refreshSchema') {
      // Trigger schema refresh for a node
      const nodeId = body.nodeId;
      if (!nodeId) {
        throw new Error('Missing node ID');
      }
      
      // Get file ID for the node
      const { data: fileData, error: fileError } = await supabase
        .from('workflow_files')
        .select('file_id')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      if (fileError) {
        throw new Error(`Error fetching file data: ${fileError.message}`);
      }
      
      if (!fileData?.file_id) {
        return new Response(
          JSON.stringify({ 
            success: false,
            message: `No file associated with node ${nodeId}`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Try to get schema from database
      const { data: schema, error: schemaError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types, sheet_name')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .eq('sheet_name', sheetName || 'Sheet1')
        .maybeSingle();
      
      if (schemaError) {
        throw new Error(`Error fetching schema: ${schemaError.message}`);
      }
      
      // Format schema if available
      let formattedSchema = null;
      if (schema && schema.columns && schema.columns.length > 0) {
        formattedSchema = schema.columns.map(col => ({
          name: col,
          type: schema.data_types[col] || 'unknown'
        }));
      }
      
      if (!formattedSchema) {
        // Try to process file to get schema
        try {
          await supabase.functions.invoke('processFile', {
            body: {
              fileId: fileData.file_id,
              workflowId: dbWorkflowId,
              nodeId,
              requestedSheetName: sheetName || 'Sheet1',
              forceRefresh: true
            }
          });
          
          // Wait briefly for processing
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Try to get schema again
          const { data: refreshedSchema, error: refreshError } = await supabase
            .from('workflow_file_schemas')
            .select('columns, data_types, sheet_name')
            .eq('workflow_id', dbWorkflowId)
            .eq('node_id', nodeId)
            .eq('sheet_name', sheetName || 'Sheet1')
            .maybeSingle();
            
          if (!refreshError && refreshedSchema?.columns && refreshedSchema.columns.length > 0) {
            formattedSchema = refreshedSchema.columns.map(col => ({
              name: col,
              type: refreshedSchema.data_types[col] || 'unknown'
            }));
          }
        } catch (err) {
          console.error('Error processing file:', err);
        }
      }
      
      // If we still don't have schema, return error
      if (!formattedSchema) {
        return new Response(
          JSON.stringify({ 
            success: false,
            message: `Could not get schema for node ${nodeId}`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Broadcast schema update
      const schemaVersion = Date.now();
      const channel = supabase.channel(`schema_updates:${dbWorkflowId}:${nodeId}`);
      
      await channel.send({
        type: 'broadcast',
        event: 'schema_update',
        payload: {
          workflowId: dbWorkflowId,
          nodeId,
          schema: formattedSchema,
          timestamp: Date.now(),
          source: 'refresh',
          version: schemaVersion,
          sheetName: sheetName || schema?.sheet_name || 'Sheet1'
        }
      });
      
      return new Response(
        JSON.stringify({ 
          success: true,
          schema: formattedSchema,
          version: schemaVersion
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    else {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
  } catch (error) {
    console.error('Function error:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
