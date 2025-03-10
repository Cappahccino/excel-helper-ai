
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

// Helper function to convert workflow ID format as needed
function normalizeWorkflowId(workflowId: string): string {
  if (workflowId.startsWith('temp-')) {
    return workflowId.substring(5);
  }
  return workflowId;
}

// Helper function to detect column type from sample values
function detectColumnType(sampleValues: any[]): string {
  // If no samples, default to string
  if (!sampleValues || sampleValues.length === 0) {
    return 'string';
  }
  
  // Check if all values are numbers
  const allNumbers = sampleValues.every(val => {
    if (val === null || val === undefined || val === '') return true;
    const num = Number(val);
    return !isNaN(num);
  });
  
  if (allNumbers) return 'number';
  
  // Check if all values are dates
  const allDates = sampleValues.every(val => {
    if (val === null || val === undefined || val === '') return true;
    const date = new Date(val);
    return !isNaN(date.getTime()) && 
           // Additional check to filter false positives
           (String(val).includes('-') || String(val).includes('/'));
  });
  
  if (allDates) return 'date';
  
  // Check if all values are boolean
  const boolValues = ['true', 'false', 'yes', 'no', '0', '1'];
  const allBooleans = sampleValues.every(val => {
    if (val === null || val === undefined || val === '') return true;
    return boolValues.includes(String(val).toLowerCase());
  });
  
  if (allBooleans) return 'boolean';
  
  // Default to string
  return 'string';
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
    
    // Get file information
    const { data: fileInfo, error: fileError } = await supabaseAdmin
      .from('excel_files')
      .select('file_path, filename, mime_type, file_size')
      .eq('id', fileId)
      .single();
      
    if (fileError) {
      console.error('Error fetching file info:', fileError);
      throw fileError;
    }
    
    // Download file from storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from('excel_files')
      .download(fileInfo.file_path);
      
    if (downloadError) {
      console.error('Error downloading file:', downloadError);
      throw downloadError;
    }
    
    // Process file based on mime type
    let columnDefinitions = {};
    let dataSummary = {
      numSheets: 0,
      totalRows: 0,
      sheetNames: []
    };
    
    // Convert ArrayBuffer to appropriate format for XLSX
    const buffer = await fileData.arrayBuffer();
    
    try {
      // Read the workbook using XLSX
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      
      // Store sheet information
      dataSummary.numSheets = workbook.SheetNames.length;
      dataSummary.sheetNames = workbook.SheetNames;
      
      // Process the first sheet
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert worksheet to JSON
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Get total rows
      dataSummary.totalRows = data.length;
      
      if (data.length > 0) {
        const headers = data[0];
        
        // Analyze column types
        for (let colIndex = 0; colIndex < headers.length; colIndex++) {
          const header = headers[colIndex];
          
          // Get sample values from first 10 rows (or all rows if fewer)
          const sampleValues = [];
          for (let rowIndex = 1; rowIndex < Math.min(data.length, 11); rowIndex++) {
            if (data[rowIndex] && data[rowIndex][colIndex] !== undefined) {
              sampleValues.push(data[rowIndex][colIndex]);
            }
          }
          
          // Detect column type
          const type = detectColumnType(sampleValues);
          columnDefinitions[header.toString()] = type;
        }
      }
    } catch (processingError) {
      console.error('Error processing file content:', processingError);
      throw new Error(`Failed to process file content: ${processingError.message}`);
    }
    
    // Create or update file metadata
    const { data: metadata, error: metadataError } = await supabaseAdmin
      .from('file_metadata')
      .upsert({
        file_id: fileId,
        row_count: dataSummary.totalRows > 0 ? dataSummary.totalRows - 1 : 0, // Subtract header row
        column_definitions: columnDefinitions,
        data_summary: dataSummary,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'file_id'
      });
    
    if (metadataError) {
      console.error('Error updating file metadata:', metadataError);
      throw metadataError;
    }
    
    // Ensure workflow_file_schemas exists
    const { error: schemaError } = await supabaseAdmin
      .from('workflow_file_schemas')
      .upsert({
        workflow_id: dbWorkflowId,
        node_id: nodeId,
        file_id: fileId,
        columns: Object.keys(columnDefinitions),
        data_types: columnDefinitions,
        total_rows: dataSummary.totalRows > 0 ? dataSummary.totalRows - 1 : 0,
        has_headers: true,
        is_temporary: isTemporary
      }, {
        onConflict: 'workflow_id,node_id'
      });
      
    if (schemaError) {
      console.error('Error creating workflow file schema:', schemaError);
      throw schemaError;
    }
    
    // Mark workflow file as processed
    const { error: completeError } = await supabaseAdmin
      .from('workflow_files')
      .update({
        processing_status: 'completed',
        processing_result: {
          success: true,
          processed_at: new Date().toISOString(),
          column_count: Object.keys(columnDefinitions).length,
          row_count: dataSummary.totalRows > 0 ? dataSummary.totalRows - 1 : 0
        }
      })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .eq('file_id', fileId);
    
    if (completeError) {
      console.error('Error completing workflow file processing:', completeError);
      throw completeError;
    }
    
    return { 
      success: true, 
      fileId,
      filename: fileInfo.filename,
      columnDefinitions,
      dataSummary
    };
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
