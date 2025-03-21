
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

interface SchemaOperationRequest {
  operation: 'recover' | 'validate' | 'sync' | 'debug';
  workflowId: string;
  nodeId: string;
  sourceNodeId?: string;
  sheetName?: string;
  forceRefresh?: boolean;
  metadata?: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request
    const requestData = await req.json() as SchemaOperationRequest;
    console.log(`Processing ${requestData.operation} request for node ${requestData.nodeId} in workflow ${requestData.workflowId}`);
    
    // Import is inside try block to handle potential failure gracefully
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Normalize workflow ID (remove 'temp-' prefix if present)
    const dbWorkflowId = requestData.workflowId.startsWith('temp-') 
      ? requestData.workflowId.substring(5) 
      : requestData.workflowId;
      
    let result;
    
    switch (requestData.operation) {
      case 'recover':
        result = await recoverNodeSchema(
          supabase, 
          dbWorkflowId, 
          requestData.nodeId, 
          requestData.sourceNodeId,
          requestData.sheetName
        );
        break;
        
      case 'validate':
        result = await validateNodeSchemaConsistency(
          supabase, 
          dbWorkflowId, 
          requestData.nodeId,
          requestData.sheetName
        );
        break;
        
      case 'sync':
        result = await syncNodeSchemas(
          supabase, 
          dbWorkflowId, 
          requestData.nodeId,
          requestData.sourceNodeId,
          requestData.sheetName
        );
        break;
        
      case 'debug':
        result = await getDebugInfo(
          supabase, 
          dbWorkflowId, 
          requestData.nodeId,
          requestData.metadata
        );
        break;
        
      default:
        throw new Error(`Unknown operation: ${requestData.operation}`);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        data: result
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error(`Error in schemaRecovery function:`, error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        errorType: error.name,
        details: error.stack
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

async function recoverNodeSchema(
  supabase: any, 
  workflowId: string, 
  nodeId: string,
  sourceNodeId?: string,
  sheetName?: string
) {
  console.log(`Recovering schema for node ${nodeId} from ${sourceNodeId || 'history'}`);
  
  // Try to recover from source node if provided
  if (sourceNodeId) {
    // Get source node schema
    const { data: sourceSchema, error: sourceError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, file_id, sheet_name')
      .eq('workflow_id', workflowId)
      .eq('node_id', sourceNodeId)
      .eq('sheet_name', sheetName || 'Sheet1')
      .maybeSingle();
      
    if (sourceError) {
      throw new Error(`Failed to get source schema: ${sourceError.message}`);
    }
    
    if (!sourceSchema) {
      throw new Error(`No schema found for source node ${sourceNodeId}`);
    }
    
    // Propagate schema to target node
    const { error: propagateError } = await supabase
      .from('workflow_file_schemas')
      .upsert({
        workflow_id: workflowId,
        node_id: nodeId,
        file_id: sourceSchema.file_id,
        columns: sourceSchema.columns,
        data_types: sourceSchema.data_types,
        sheet_name: sheetName || sourceSchema.sheet_name || 'Sheet1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_id,node_id,sheet_name'
      });
      
    if (propagateError) {
      throw new Error(`Failed to propagate schema: ${propagateError.message}`);
    }
    
    return {
      recovered: true,
      source: 'sourceNode',
      columns: sourceSchema.columns.length,
      schema: sourceSchema.columns.map((col: string) => ({
        name: col,
        type: sourceSchema.data_types[col] || 'unknown'
      }))
    };
  }
  
  // If no source node, try to recover from history
  // Get the most recent schema for this node (if it exists)
  const { data: historySchema, error: historyError } = await supabase
    .from('workflow_file_schema_history')
    .select('columns, data_types, file_id, sheet_name')
    .eq('workflow_id', workflowId)
    .eq('node_id', nodeId)
    .eq('sheet_name', sheetName || 'Sheet1')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
    
  if (historyError) {
    throw new Error(`Failed to get schema history: ${historyError.message}`);
  }
  
  if (!historySchema) {
    return {
      recovered: false,
      reason: 'No history found for this node'
    };
  }
  
  // Restore schema from history
  const { error: restoreError } = await supabase
    .from('workflow_file_schemas')
    .upsert({
      workflow_id: workflowId,
      node_id: nodeId,
      file_id: historySchema.file_id,
      columns: historySchema.columns,
      data_types: historySchema.data_types,
      sheet_name: sheetName || historySchema.sheet_name || 'Sheet1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'workflow_id,node_id,sheet_name'
    });
    
  if (restoreError) {
    throw new Error(`Failed to restore schema: ${restoreError.message}`);
  }
  
  return {
    recovered: true,
    source: 'history',
    columns: historySchema.columns.length,
    schema: historySchema.columns.map((col: string) => ({
      name: col,
      type: historySchema.data_types[col] || 'unknown'
    }))
  };
}

async function validateNodeSchemaConsistency(
  supabase: any, 
  workflowId: string, 
  nodeId: string,
  sheetName?: string
) {
  console.log(`Validating schema consistency for node ${nodeId}`);
  
  // Get node schema
  const { data: nodeSchema, error: nodeError } = await supabase
    .from('workflow_file_schemas')
    .select('columns, data_types, file_id, sheet_name')
    .eq('workflow_id', workflowId)
    .eq('node_id', nodeId)
    .eq('sheet_name', sheetName || 'Sheet1')
    .maybeSingle();
    
  if (nodeError) {
    throw new Error(`Failed to get node schema: ${nodeError.message}`);
  }
  
  if (!nodeSchema) {
    return {
      valid: false,
      reason: 'No schema found for this node'
    };
  }
  
  // Get file metadata
  const { data: fileMetadata, error: fileError } = await supabase
    .from('file_metadata')
    .select('column_definitions, sheets_metadata')
    .eq('file_id', nodeSchema.file_id)
    .maybeSingle();
    
  if (fileError) {
    throw new Error(`Failed to get file metadata: ${fileError.message}`);
  }
  
  if (!fileMetadata) {
    return {
      valid: false,
      reason: 'No file metadata found for the associated file'
    };
  }
  
  // Check if all columns in the schema exist in the file metadata
  const fileColumns = fileMetadata.column_definitions || {};
  const schemaColumns = nodeSchema.columns || [];
  
  const missingColumns = schemaColumns.filter(
    (col: string) => !Object.keys(fileColumns).includes(col)
  );
  
  // Check if the sheet exists in the file metadata
  const sheetExists = fileMetadata.sheets_metadata && 
    Array.isArray(fileMetadata.sheets_metadata) && 
    fileMetadata.sheets_metadata.some((sheet: any) => sheet.name === (sheetName || 'Sheet1'));
  
  return {
    valid: missingColumns.length === 0 && sheetExists,
    missingColumns: missingColumns.length > 0 ? missingColumns : null,
    sheetExists,
    schemaColumnsCount: schemaColumns.length,
    fileColumnsCount: Object.keys(fileColumns).length
  };
}

async function syncNodeSchemas(
  supabase: any, 
  workflowId: string, 
  nodeId: string,
  sourceNodeId?: string,
  sheetName?: string
) {
  console.log(`Syncing schemas between nodes ${sourceNodeId} -> ${nodeId}`);
  
  if (!sourceNodeId) {
    throw new Error('Source node ID is required for schema sync');
  }
  
  // Get the workflow edges to find incoming connections
  const { data: edges, error: edgesError } = await supabase
    .from('workflow_edges')
    .select('source_node_id, target_node_id, metadata')
    .eq('workflow_id', workflowId)
    .eq('source_node_id', sourceNodeId)
    .eq('target_node_id', nodeId);
    
  if (edgesError) {
    throw new Error(`Failed to get workflow edges: ${edgesError.message}`);
  }
  
  // Get source node schema
  const { data: sourceSchema, error: sourceError } = await supabase
    .from('workflow_file_schemas')
    .select('columns, data_types, file_id, sheet_name')
    .eq('workflow_id', workflowId)
    .eq('node_id', sourceNodeId)
    .eq('sheet_name', sheetName || 'Sheet1')
    .maybeSingle();
    
  if (sourceError) {
    throw new Error(`Failed to get source schema: ${sourceError.message}`);
  }
  
  if (!sourceSchema) {
    throw new Error(`No schema found for source node ${sourceNodeId}`);
  }
  
  // Get source selected sheet
  const { data: sourceFile, error: sourceFileError } = await supabase
    .from('workflow_files')
    .select('metadata')
    .eq('workflow_id', workflowId)
    .eq('node_id', sourceNodeId)
    .maybeSingle();
    
  if (sourceFileError) {
    throw new Error(`Failed to get source file: ${sourceFileError.message}`);
  }
  
  const selectedSheet = (sourceFile?.metadata as any)?.selected_sheet || 'Sheet1';
  
  // Propagate schema to target node
  const { error: propagateError } = await supabase
    .from('workflow_file_schemas')
    .upsert({
      workflow_id: workflowId,
      node_id: nodeId,
      file_id: sourceSchema.file_id,
      columns: sourceSchema.columns,
      data_types: sourceSchema.data_types,
      sheet_name: sheetName || selectedSheet,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'workflow_id,node_id,sheet_name'
    });
    
  if (propagateError) {
    throw new Error(`Failed to propagate schema: ${propagateError.message}`);
  }
  
  // Update target node metadata with selected sheet
  const { error: updateError } = await supabase
    .from('workflow_files')
    .update({
      metadata: {
        selected_sheet: sheetName || selectedSheet
      }
    })
    .eq('workflow_id', workflowId)
    .eq('node_id', nodeId);
    
  if (updateError) {
    throw new Error(`Failed to update target metadata: ${updateError.message}`);
  }
  
  // Also update edge metadata to remember last sync
  if (edges && edges.length > 0) {
    const edgeMetadata = edges[0].metadata || {};
    
    const { error: edgeUpdateError } = await supabase
      .from('workflow_edges')
      .update({
        metadata: {
          ...edgeMetadata,
          last_schema_sync: new Date().toISOString(),
          schema_sync_count: ((edgeMetadata as any).schema_sync_count || 0) + 1
        }
      })
      .eq('workflow_id', workflowId)
      .eq('source_node_id', sourceNodeId)
      .eq('target_node_id', nodeId);
      
    if (edgeUpdateError) {
      console.error(`Failed to update edge metadata: ${edgeUpdateError.message}`);
      // Non-critical error, continue
    }
  }
  
  return {
    success: true,
    sourceNode: sourceNodeId,
    targetNode: nodeId,
    columns: sourceSchema.columns.length,
    selectedSheet: sheetName || selectedSheet
  };
}

async function getDebugInfo(
  supabase: any, 
  workflowId: string, 
  nodeId: string,
  metadata?: Record<string, any>
) {
  console.log(`Getting debug info for node ${nodeId}`);
  
  // Get node schemas
  const { data: nodeSchemas, error: schemasError } = await supabase
    .from('workflow_file_schemas')
    .select('sheet_name, columns, data_types, file_id, created_at, updated_at')
    .eq('workflow_id', workflowId)
    .eq('node_id', nodeId);
    
  if (schemasError) {
    throw new Error(`Failed to get node schemas: ${schemasError.message}`);
  }
  
  // Get workflow file info
  const { data: fileInfo, error: fileError } = await supabase
    .from('workflow_files')
    .select('file_id, status, metadata, created_at, updated_at')
    .eq('workflow_id', workflowId)
    .eq('node_id', nodeId)
    .maybeSingle();
    
  if (fileError) {
    throw new Error(`Failed to get file info: ${fileError.message}`);
  }
  
  // Get incoming edges
  const { data: incomingEdges, error: incomingError } = await supabase
    .from('workflow_edges')
    .select('source_node_id, metadata')
    .eq('workflow_id', workflowId)
    .eq('target_node_id', nodeId);
    
  if (incomingError) {
    throw new Error(`Failed to get incoming edges: ${incomingError.message}`);
  }
  
  // Get outgoing edges
  const { data: outgoingEdges, error: outgoingError } = await supabase
    .from('workflow_edges')
    .select('target_node_id, metadata')
    .eq('workflow_id', workflowId)
    .eq('source_node_id', nodeId);
    
  if (outgoingError) {
    throw new Error(`Failed to get outgoing edges: ${outgoingError.message}`);
  }
  
  // Collect system metadata if requested
  let systemInfo = null;
  if (metadata?.includeSystemInfo) {
    systemInfo = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      region: Deno.env.get('REGION') || 'unknown',
      serviceRole: supabaseKey ? 'available' : 'unavailable'
    };
  }
  
  return {
    node: {
      id: nodeId,
      schemas: nodeSchemas || [],
      file: fileInfo,
      schemasCount: nodeSchemas?.length || 0
    },
    connections: {
      incoming: incomingEdges || [],
      outgoing: outgoingEdges || [],
      incomingCount: incomingEdges?.length || 0,
      outgoingCount: outgoingEdges?.length || 0
    },
    systemInfo,
    clientMetadata: metadata || {}
  };
}
