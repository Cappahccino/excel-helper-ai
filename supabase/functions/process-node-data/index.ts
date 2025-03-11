
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

// Main processing function
async function processNodeOperation(
  nodeId: string, 
  workflowId: string, 
  operation: string, 
  config: any,
  executionId: string,
  previewMode = false
) {
  console.log(`Processing ${operation} operation for node ${nodeId} in workflow ${workflowId}`);
  console.log('Config:', JSON.stringify(config));
  
  try {
    // Format workflow ID for database
    const dbWorkflowId = normalizeWorkflowId(workflowId);
    
    // Get incoming edge to determine source node
    const { data: edges, error: edgeError } = await supabaseAdmin
      .from('workflow_edges')
      .select('source_node_id')
      .eq('workflow_id', dbWorkflowId)
      .eq('target_node_id', nodeId);
      
    if (edgeError) {
      throw new Error(`Error fetching edges: ${edgeError.message}`);
    }
    
    if (!edges || edges.length === 0) {
      throw new Error('No input connections found');
    }
    
    const sourceNodeId = edges[0].source_node_id;
    console.log(`Source node: ${sourceNodeId}`);
    
    // Check if source is a file upload node
    const { data: fileNode, error: fileNodeError } = await supabaseAdmin
      .from('workflow_files')
      .select('file_id')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (fileNodeError) {
      throw new Error(`Error checking for file node: ${fileNodeError.message}`);
    }
    
    let inputData = [];
    
    if (fileNode?.file_id) {
      // Get file metadata to understand structure
      const { data: fileMetadata, error: metadataError } = await supabaseAdmin
        .from('workflow_file_schemas')
        .select('*')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .maybeSingle();
        
      if (metadataError) {
        throw new Error(`Error fetching file metadata: ${metadataError.message}`);
      }
      
      if (!fileMetadata) {
        throw new Error('No file schema found for source node');
      }
      
      console.log(`File schema found with ${fileMetadata.columns.length} columns`);
      
      // Get step logs for file upload node to extract data
      const { data: sourceLogs, error: logsError } = await supabaseAdmin
        .from('workflow_step_logs')
        .select('output_data')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (logsError) {
        throw new Error(`Error fetching source logs: ${logsError.message}`);
      }
      
      if (sourceLogs && sourceLogs.length > 0 && sourceLogs[0].output_data) {
        // Extract data from the logs
        inputData = extractDataFromLogs(sourceLogs[0].output_data);
        
        if (!inputData || inputData.length === 0) {
          console.log('No data found in source logs, trying to get file data directly');
          
          // Try to get data directly from file storage
          const { data: fileInfo, error: fileError } = await supabaseAdmin
            .from('excel_files')
            .select('file_path')
            .eq('id', fileNode.file_id)
            .single();
            
          if (fileError) {
            throw new Error(`Error fetching file info: ${fileError.message}`);
          }
          
          // Download file content
          const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from('excel_files')
            .download(fileInfo.file_path);
            
          if (downloadError) {
            throw new Error(`Error downloading file: ${downloadError.message}`);
          }
          
          // Parse the file data
          inputData = await parseFileData(fileData, fileInfo.file_path);
        }
      } else {
        throw new Error('No source data found in logs');
      }
    } else {
      // Check if the source node has logs with data
      const { data: sourceLogs, error: logsError } = await supabaseAdmin
        .from('workflow_step_logs')
        .select('output_data')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (logsError) {
        throw new Error(`Error fetching source logs: ${logsError.message}`);
      }
      
      if (sourceLogs && sourceLogs.length > 0 && sourceLogs[0].output_data) {
        // Extract data from the logs
        inputData = extractDataFromLogs(sourceLogs[0].output_data);
      } else {
        throw new Error('No data found from source node');
      }
    }
    
    console.log(`Processing ${inputData.length} rows of data`);
    
    // Apply the specified operation
    let processedData = [];
    let message = '';
    
    switch (operation) {
      case 'filtering':
        message = `Filtered where ${config.column} ${config.operator} ${config.value}`;
        processedData = applyFilter(inputData, config);
        break;
        
      case 'sorting':
        message = `Sorted by ${config.column} ${config.order}`;
        processedData = applySorting(inputData, config);
        break;
        
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
    
    console.log(`Operation resulted in ${processedData.length} rows`);
    
    // Create the result object
    const result = {
      processedData,
      rowCount: processedData.length,
      columns: processedData.length > 0 ? Object.keys(processedData[0]) : [],
      operation,
      config
    };
    
    // Log the processing results
    const logEntry = {
      workflow_id: dbWorkflowId,
      execution_id: executionId,
      node_id: nodeId,
      node_type: operation,
      status: 'completed',
      message,
      log_type: previewMode ? 'preview' : 'execution',
      output_data: { result },
      created_at: new Date().toISOString()
    };
    
    const { error: logError } = await supabaseAdmin
      .from('workflow_step_logs')
      .insert(logEntry);
      
    if (logError) {
      console.error('Error logging result:', logError);
    }
    
    return {
      success: true,
      result
    };
  } catch (error) {
    console.error('Error in process-node-data:', error);
    
    // Log the error
    try {
      const dbWorkflowId = normalizeWorkflowId(workflowId);
      
      const errorLog = {
        workflow_id: dbWorkflowId,
        execution_id: executionId,
        node_id: nodeId,
        node_type: operation,
        status: 'error',
        message: `Error: ${error.message}`,
        log_type: previewMode ? 'preview' : 'execution',
        error_details: { error: error.message, stack: error.stack },
        created_at: new Date().toISOString()
      };
      
      await supabaseAdmin
        .from('workflow_step_logs')
        .insert(errorLog);
    } catch (logError) {
      console.error('Error logging failure:', logError);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Helper functions for data processing

function extractDataFromLogs(logData: any): any[] {
  // Check different possible locations for the data
  if (logData.result && logData.result.processedData) {
    return logData.result.processedData;
  }
  
  if (logData.data && Array.isArray(logData.data)) {
    return logData.data;
  }
  
  if (logData.rows && Array.isArray(logData.rows)) {
    return logData.rows;
  }
  
  if (Array.isArray(logData)) {
    return logData;
  }
  
  return [];
}

async function parseFileData(fileData: ArrayBuffer, filePath: string): Promise<any[]> {
  const text = new TextDecoder().decode(fileData);
  
  // Handle different line endings
  const rows = text.split(/\r?\n/);
  
  if (rows.length < 2) {
    return [];
  }
  
  // Try to detect the delimiter
  const potentialDelimiters = [',', ';', '\t', '|'];
  let delimiter = ',';
  
  for (const d of potentialDelimiters) {
    if (rows[0].includes(d)) {
      delimiter = d;
      break;
    }
  }
  
  // Parse headers and data
  const headers = rows[0].split(delimiter).map(h => h.trim());
  
  return rows.slice(1)
    .filter(row => row.trim()) // Skip empty rows
    .map(row => {
      const values = row.split(delimiter);
      const obj: Record<string, any> = {};
      
      headers.forEach((header, i) => {
        if (header) {
          obj[header] = i < values.length ? values[i].trim() : '';
        }
      });
      
      return obj;
    });
}

function applyFilter(data: any[], config: any): any[] {
  if (!data || data.length === 0) return [];
  if (!config.column || !config.operator) return data;
  
  return data.filter(row => {
    // Handle missing column in row
    if (!row || typeof row !== 'object' || !(config.column in row)) {
      return false;
    }
    
    const cellValue = row[config.column];
    const filterValue = config.value;
    
    // Handle null/undefined
    if (cellValue === null || cellValue === undefined) {
      return false;
    }
    
    switch (config.operator) {
      case 'equals':
        return String(cellValue).toLowerCase() === String(filterValue).toLowerCase();
        
      case 'not-equals':
        return String(cellValue).toLowerCase() !== String(filterValue).toLowerCase();
        
      case 'contains':
        return String(cellValue).toLowerCase().includes(String(filterValue).toLowerCase());
        
      case 'starts-with':
        return String(cellValue).toLowerCase().startsWith(String(filterValue).toLowerCase());
        
      case 'ends-with':
        return String(cellValue).toLowerCase().endsWith(String(filterValue).toLowerCase());
        
      case 'greater-than':
        return Number(cellValue) > Number(filterValue);
        
      case 'less-than':
        return Number(cellValue) < Number(filterValue);
        
      case 'between':
        const [min, max] = filterValue.split(',').map(v => Number(v.trim()));
        return Number(cellValue) >= min && Number(cellValue) <= max;
        
      case 'before':
        return new Date(cellValue) < new Date(filterValue);
        
      case 'after':
        return new Date(cellValue) > new Date(filterValue);
        
      default:
        return true;
    }
  });
}

function applySorting(data: any[], config: any): any[] {
  if (!data || data.length === 0) return [];
  if (!config.column) return data;
  
  const isAscending = config.order !== 'descending';
  
  return [...data].sort((a, b) => {
    // Handle missing values
    if (!a[config.column] && !b[config.column]) return 0;
    if (!a[config.column]) return isAscending ? -1 : 1;
    if (!b[config.column]) return isAscending ? 1 : -1;
    
    // Determine value type and sort accordingly
    const valueA = a[config.column];
    const valueB = b[config.column];
    
    // Try numeric comparison first
    const numA = Number(valueA);
    const numB = Number(valueB);
    
    if (!isNaN(numA) && !isNaN(numB)) {
      return isAscending ? numA - numB : numB - numA;
    }
    
    // Try date comparison
    const dateA = new Date(valueA);
    const dateB = new Date(valueB);
    
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      return isAscending 
        ? dateA.getTime() - dateB.getTime() 
        : dateB.getTime() - dateA.getTime();
    }
    
    // Default to string comparison
    const strA = String(valueA).toLowerCase();
    const strB = String(valueB).toLowerCase();
    
    return isAscending 
      ? strA.localeCompare(strB) 
      : strB.localeCompare(strA);
  });
}

// Handle HTTP requests
Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  
  try {
    const { 
      nodeId, 
      workflowId, 
      operation, 
      config = {},
      executionId = `preview-${Date.now()}`,
      previewMode = false
    } = await req.json();
    
    // Validate input
    if (!nodeId || !workflowId || !operation) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required parameters' 
        }),
        { 
          status: 400,
          headers: corsHeaders
        }
      );
    }
    
    // Process the operation
    const result = await processNodeOperation(
      nodeId,
      workflowId,
      operation,
      config,
      executionId,
      previewMode
    );
    
    // Return the result
    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 500,
        headers: corsHeaders
      }
    );
  } catch (error) {
    console.error('Error handling request:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error'
      }),
      { 
        status: 500,
        headers: corsHeaders
      }
    );
  }
});
