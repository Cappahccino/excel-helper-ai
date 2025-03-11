
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.27.0'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

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

// Main function to handle requests
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const { 
      nodeId, 
      workflowId, 
      operation, 
      config,
      previewMode = false,
      maxRows = 100,
      executionId = null 
    } = await req.json();
    
    // Validate input
    if (!nodeId || !workflowId || !operation) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    console.log(`Processing node ${nodeId} in workflow ${workflowId}, operation: ${operation}`);
    console.log(`Config:`, JSON.stringify(config));
    
    // Get input data based on connections
    const inputData = await getInputData(workflowId, nodeId, executionId);
    
    if (!inputData || inputData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No input data available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Apply operation to data
    let outputData;
    let processingInfo = {};
    
    switch (operation) {
      case 'filtering':
        const filterResult = applyFilter(inputData, config);
        outputData = filterResult.data;
        processingInfo = filterResult.info;
        break;
        
      case 'sorting':
        const sortResult = applySorting(inputData, config);
        outputData = sortResult.data;
        processingInfo = sortResult.info;
        break;
        
      // Additional operations can be added here
        
      default:
        return new Response(
          JSON.stringify({ error: `Unsupported operation: ${operation}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
    
    // Limit data for preview mode
    if (previewMode && maxRows > 0 && outputData.length > maxRows) {
      outputData = outputData.slice(0, maxRows);
    }
    
    // Save to workflow step logs
    const { error: logError } = await saveToStepLogs(
      workflowId,
      nodeId,
      executionId || `preview-${Date.now()}`,
      operation,
      inputData,
      outputData,
      config,
      processingInfo,
      previewMode
    );
    
    if (logError) {
      console.error('Error saving to step logs:', logError);
    }
    
    // Return processed data
    return new Response(
      JSON.stringify({
        success: true,
        result: {
          processedData: outputData,
          rowCount: outputData.length,
          columns: outputData.length > 0 ? Object.keys(outputData[0]) : [],
          processingInfo: processingInfo
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
    
  } catch (error) {
    console.error('Error processing node data:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/**
 * Get input data for a node
 */
async function getInputData(workflowId, nodeId, executionId) {
  try {
    // First, get the source node(s)
    const { data: edges, error: edgeError } = await supabaseAdmin
      .from('workflow_edges')
      .select('source_node_id')
      .eq('workflow_id', workflowId)
      .eq('target_node_id', nodeId);
      
    if (edgeError) throw new Error(`Error fetching edges: ${edgeError.message}`);
    if (!edges || edges.length === 0) throw new Error('No input connections found');
    
    // For now, just use the first source node
    const sourceNodeId = edges[0].source_node_id;
    
    // Check if source is a file node
    const { data: workflowFile, error: fileError } = await supabaseAdmin
      .from('workflow_files')
      .select('file_id, processing_status')
      .eq('workflow_id', workflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (fileError) throw new Error(`Error checking for file node: ${fileError.message}`);
    
    if (workflowFile?.file_id) {
      // It's a file node, get file data
      return await getFileData(workflowFile.file_id);
    }
    
    // Check if there's a previous execution log we can use
    if (executionId) {
      if (executionId.startsWith('preview-')) {
        // For preview mode, check if source node has preview data
        const { data: prevLogs, error: logError } = await supabaseAdmin
          .from('workflow_step_logs')
          .select('output_data')
          .eq('workflow_id', workflowId)
          .eq('node_id', sourceNodeId)
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (logError) throw new Error(`Error fetching logs: ${logError.message}`);
        
        if (prevLogs && prevLogs.length > 0 && prevLogs[0].output_data?.result?.processedData) {
          return prevLogs[0].output_data.result.processedData;
        }
      } else {
        // For real executions, check actual execution data
        const { data: executionLog, error: execLogError } = await supabaseAdmin
          .from('workflow_step_logs')
          .select('output_data')
          .eq('execution_id', executionId)
          .eq('node_id', sourceNodeId)
          .single();
          
        if (execLogError) throw new Error(`Error fetching execution log: ${execLogError.message}`);
        
        if (executionLog?.output_data?.result?.processedData) {
          return executionLog.output_data.result.processedData;
        }
      }
    }
    
    throw new Error('Could not find input data for node');
  } catch (error) {
    console.error('Error in getInputData:', error);
    throw error;
  }
}

/**
 * Get data from a file
 */
async function getFileData(fileId) {
  try {
    // Get file information
    const { data: fileInfo, error: fileError } = await supabaseAdmin
      .from('excel_files')
      .select('file_path, mime_type')
      .eq('id', fileId)
      .single();
      
    if (fileError) throw new Error(`Error fetching file info: ${fileError.message}`);
    if (!fileInfo?.file_path) throw new Error('File path not found');
    
    // Download file from storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from('excel_files')
      .download(fileInfo.file_path);
      
    if (downloadError) throw new Error(`Error downloading file: ${downloadError.message}`);
    
    // Parse file based on type
    const buffer = await fileData.arrayBuffer();
    const array = new Uint8Array(buffer);
    
    // Use XLSX to parse for both Excel and CSV
    const workbook = XLSX.read(array, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Convert to JSON with headers
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
    
    if (data.length < 2) {
      // Only header row or empty
      return [];
    }
    
    // Convert to array of objects using first row as headers
    const headers = data[0];
    return data.slice(1).map(row => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });
      return record;
    });
    
  } catch (error) {
    console.error('Error in getFileData:', error);
    throw error;
  }
}

/**
 * Apply filter operation to data
 */
function applyFilter(data, config) {
  if (!data || !data.length) return { data: [], info: { filtered: 0 } };
  if (!config?.column || !config?.operator) return { data: data, info: { filtered: 0 } };
  
  const startCount = data.length;
  
  const filtered = data.filter(row => {
    const cellValue = row[config.column];
    
    // Handle null values
    if (cellValue === null || cellValue === undefined) {
      return false;
    }
    
    const filterValue = config.value;
    
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
        if (!filterValue.includes(',')) return false;
        
        const [min, max] = filterValue.split(',').map(v => Number(v.trim()));
        return Number(cellValue) >= min && Number(cellValue) <= max;
        
      case 'before':
        try {
          return new Date(cellValue) < new Date(filterValue);
        } catch {
          return false;
        }
        
      case 'after':
        try {
          return new Date(cellValue) > new Date(filterValue);
        } catch {
          return false;
        }
        
      default:
        return true;
    }
  });
  
  return { 
    data: filtered, 
    info: { 
      filtered: startCount - filtered.length,
      total: startCount,
      remaining: filtered.length
    }
  };
}

/**
 * Apply sorting operation to data
 */
function applySorting(data, config) {
  if (!data || !data.length) return { data: [], info: { sorted: false } };
  if (!config?.column) return { data: data, info: { sorted: false } };
  
  const sorted = [...data].sort((a, b) => {
    const valueA = a[config.column];
    const valueB = b[config.column];
    
    // Handle null values
    if (valueA === null || valueA === undefined) return config.order === 'ascending' ? -1 : 1;
    if (valueB === null || valueB === undefined) return config.order === 'ascending' ? 1 : -1;
    
    // Try to determine if values are numbers, dates, or strings
    if (!isNaN(Number(valueA)) && !isNaN(Number(valueB))) {
      // Numeric comparison
      return config.order === 'ascending' 
        ? Number(valueA) - Number(valueB) 
        : Number(valueB) - Number(valueA);
    }
    
    // Try date comparison
    const dateA = new Date(valueA);
    const dateB = new Date(valueB);
    
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      return config.order === 'ascending' 
        ? dateA.getTime() - dateB.getTime() 
        : dateB.getTime() - dateA.getTime();
    }
    
    // Default to string comparison
    const strA = String(valueA).toLowerCase();
    const strB = String(valueB).toLowerCase();
    
    if (config.order === 'ascending') {
      return strA.localeCompare(strB);
    } else {
      return strB.localeCompare(strA);
    }
  });
  
  return { 
    data: sorted, 
    info: { 
      sorted: true,
      column: config.column,
      order: config.order
    }
  };
}

/**
 * Save processing results to workflow step logs
 */
async function saveToStepLogs(
  workflowId,
  nodeId,
  executionId,
  operation,
  inputData,
  outputData,
  config,
  processingInfo,
  isPreview = false
) {
  try {
    // Trim input/output data to avoid exceeding storage limits
    const trimmedInputSample = inputData.slice(0, 10);
    const trimmedOutputSample = outputData.slice(0, 100);
    
    // Create log message based on operation
    let message = `Data processed with ${operation}`;
    let nodeType = 'dataProcessing';
    
    switch (operation) {
      case 'filtering':
        message = `Filtered ${processingInfo.filtered || 0} rows using ${config.column} ${config.operator} ${config.value}`;
        nodeType = 'filtering';
        break;
        
      case 'sorting':
        message = `Sorted data by ${config.column} in ${config.order} order`;
        nodeType = 'sorting';
        break;
    }
    
    // Create log entry
    const logEntry = {
      workflow_id: workflowId,
      node_id: nodeId,
      execution_id: executionId,
      node_type: nodeType,
      status: 'success',
      input_data: {
        sample: trimmedInputSample,
        rowCount: inputData.length
      },
      output_data: {
        result: {
          processedData: trimmedOutputSample,
          rowCount: outputData.length,
          columns: outputData.length > 0 ? Object.keys(outputData[0]) : [],
          processingInfo: processingInfo
        }
      },
      execution_time_ms: 0,
      created_at: new Date().toISOString()
    };
    
    // Save to database
    const { error } = await supabaseAdmin
      .from('workflow_step_logs')
      .insert(logEntry);
      
    return { error };
    
  } catch (error) {
    console.error('Error in saveToStepLogs:', error);
    return { error };
  }
}
