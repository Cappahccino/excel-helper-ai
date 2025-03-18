
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
    
    // Get edges to show connections
    const { data: edges, error: edgesError } = await supabase
      .from('workflow_edges')
      .select('*')
      .eq('workflow_id', dbWorkflowId);
      
    if (edgesError) {
      console.error('Error fetching edges:', edgesError);
    }
    
    // Prepare response data
    const result = {
      workflowId: dbWorkflowId,
      schemaCount: data?.length || 0,
      schemas: data || [],
      edges: edges || [],
      workflowInfo: null
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
