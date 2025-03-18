
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
    const { workflowId, nodeId } = body;
    
    if (!workflowId) {
      return new Response(
        JSON.stringify({ error: 'Missing workflowId parameter' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Normalize workflow ID
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    console.log(`Inspecting schemas for workflow ${dbWorkflowId}`);
    
    // Check if this node has a source node
    let hasSourceNode = false;
    let sourceNodes = [];
    if (nodeId) {
      const { data: edges, error: edgesError } = await supabase
        .from('workflow_edges')
        .select('source_node_id, target_node_id')
        .eq('workflow_id', dbWorkflowId)
        .eq('target_node_id', nodeId);
      
      if (!edgesError && edges && edges.length > 0) {
        hasSourceNode = true;
        sourceNodes = edges.map(edge => edge.source_node_id);
        console.log(`Node ${nodeId} has source nodes:`, sourceNodes);
      } else {
        console.log(`Node ${nodeId} has no source nodes. Error:`, edgesError);
      }
    }
    
    // If a node doesn't have source nodes, we should return early with a special message
    if (nodeId && !hasSourceNode) {
      return new Response(
        JSON.stringify({ 
          workflowId: dbWorkflowId,
          schemaCount: 0,
          schemas: [],
          edges: [],
          workflowInfo: null,
          message: 'No source node connected',
          hasSourceNode: false,
          sourceNodes: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Important: Do not filter by is_temporary to see both temporary and permanent schemas
    let query = supabase
      .from('workflow_file_schemas')
      .select('*')
      .eq('workflow_id', dbWorkflowId);
      
    if (nodeId) {
      query = query.eq('node_id', nodeId);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error inspecting schemas:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    console.log(`Found ${data?.length || 0} schemas for node ${nodeId || 'any'}`);
    
    // Get edges to show connections
    const { data: edges, error: edgesError } = await supabase
      .from('workflow_edges')
      .select('source_node_id, target_node_id')
      .eq('workflow_id', dbWorkflowId);
      
    if (edgesError) {
      console.error('Error fetching edges:', edgesError);
    } else {
      console.log(`Found ${edges?.length || 0} edges in workflow ${dbWorkflowId}`);
    }
    
    // If no schema found for this node, but it has sources, check them
    let sourceSchemasData = [];
    if (nodeId && hasSourceNode && (!data || data.length === 0)) {
      console.log(`No schema found for ${nodeId}, checking source nodes:`, sourceNodes);
      
      // Try to get schema from source nodes
      const sourceSchemaPromises = sourceNodes.map(sourceId => {
        return supabase
          .from('workflow_file_schemas')
          .select('*')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', sourceId)
          .order('created_at', { ascending: false });
      });
      
      const sourceResults = await Promise.all(sourceSchemaPromises);
      
      // Collect all valid source schemas
      sourceResults.forEach((result, index) => {
        if (!result.error && result.data && result.data.length > 0) {
          console.log(`Found schema in source node ${sourceNodes[index]}`);
          sourceSchemasData = [...sourceSchemasData, ...result.data];
        }
      });
      
      console.log(`Found ${sourceSchemasData.length} source schemas that could be propagated`);
    }
    
    // Prepare response data
    const result = {
      workflowId: dbWorkflowId,
      schemaCount: data?.length || 0,
      schemas: data || [],
      edges: edges || [],
      workflowInfo: null,
      hasSourceNode: hasSourceNode,
      sourceNodes: sourceNodes,
      sourceSchemas: sourceSchemasData,
    };
    
    // Get workflow info
    const { data: workflowData, error: workflowError } = await supabase
      .from('workflows')
      .select('id, name, created_at, updated_at, is_temporary')
      .eq('id', dbWorkflowId)
      .maybeSingle();
      
    if (!workflowError) {
      result.workflowInfo = workflowData;
    }
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in inspectSchemas function:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
