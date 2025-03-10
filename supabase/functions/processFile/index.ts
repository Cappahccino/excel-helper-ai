
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.27.0'
import { read, utils } from 'https://esm.sh/xlsx@0.18.5'

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

// Detect column data type from sample values
function detectColumnType(values: any[]): string {
  // Filter out null/undefined values
  const nonNullValues = values.filter(val => val !== null && val !== undefined);
  if (nonNullValues.length === 0) return 'string';

  // Check if all values are numbers
  if (nonNullValues.every(val => typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val))))) {
    return 'number';
  }

  // Check if all values are valid dates
  if (nonNullValues.every(val => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  })) {
    return 'date';
  }

  // Check if all values are booleans
  if (nonNullValues.every(val => typeof val === 'boolean' || val === 'true' || val === 'false')) {
    return 'boolean';
  }

  // Default to string
  return 'string';
}

// Process Excel/CSV file and extract schema and data
async function extractFileData(fileId: string) {
  try {
    // Get file metadata from database
    const { data: fileData, error: fileError } = await supabaseAdmin
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single();
    
    if (fileError) {
      console.error('Error fetching file data:', fileError);
      throw new Error(`File not found: ${fileError.message}`);
    }
    
    // Download file from storage
    const { data: fileContent, error: downloadError } = await supabaseAdmin
      .storage
      .from('excel_files')
      .download(fileData.file_path);
    
    if (downloadError) {
      console.error('Error downloading file:', downloadError);
      throw new Error(`File download failed: ${downloadError.message}`);
    }
    
    // Parse file content
    const arrayBuffer = await fileContent.arrayBuffer();
    const workbook = read(arrayBuffer, { type: 'array' });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('No sheets found in workbook');
    }
    
    // Process each sheet
    const sheets = workbook.SheetNames.map(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const data = utils.sheet_to_json(worksheet, { header: 1 });
      
      // Skip empty sheets
      if (data.length === 0) {
        return {
          name: sheetName,
          headers: [],
          rows: [],
          rowCount: 0
        };
      }
      
      // Assume first row contains headers
      const headers = data[0].map(h => String(h || `Column${data[0].indexOf(h) + 1}`));
      
      // Get data rows (skip header)
      const rows = data.slice(1).map(row => {
        // Convert to array with correct length to match headers
        const arrayRow = Array.isArray(row) ? row : [row];
        
        // Ensure row has same length as headers by padding with nulls
        while (arrayRow.length < headers.length) {
          arrayRow.push(null);
        }
        
        return arrayRow;
      });
      
      return {
        name: sheetName,
        headers,
        rows,
        rowCount: rows.length
      };
    }).filter(sheet => sheet.headers.length > 0);
    
    // Analyze first sheet for column types
    const columnDefinitions: Record<string, string> = {};
    
    if (sheets.length > 0 && sheets[0].headers.length > 0) {
      const firstSheet = sheets[0];
      
      // For each header, collect a sample of values to detect type
      firstSheet.headers.forEach((header, colIndex) => {
        // Get all values for this column
        const columnValues = firstSheet.rows
          .map(row => row[colIndex])
          .filter(val => val !== null && val !== undefined)
          .slice(0, 100); // Limit sample size
        
        // Detect column type
        columnDefinitions[header] = detectColumnType(columnValues);
      });
    }
    
    // Create data summary
    const dataSummary = {
      totalRows: sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0),
      numSheets: sheets.length,
      sheetNames: sheets.map(s => s.name),
      fileName: fileData.filename,
      fileSize: fileData.file_size,
      mimeType: fileData.mime_type,
      sampleData: sheets.length > 0 ? sheets[0].rows.slice(0, 5) : []
    };
    
    return {
      columnDefinitions,
      sheets,
      dataSummary
    };
  } catch (error) {
    console.error('Error extracting file data:', error);
    throw error;
  }
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
    
    // Extract file data and schema
    const { columnDefinitions, sheets, dataSummary } = await extractFileData(fileId);
    
    // Update file metadata
    const { data: metadata, error: metadataError } = await supabaseAdmin
      .from('file_metadata')
      .upsert({
        file_id: fileId,
        column_definitions: columnDefinitions,
        row_count: dataSummary.totalRows,
        data_summary: dataSummary,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'file_id'
      })
      .select()
      .single();
    
    if (metadataError) {
      console.error('Error updating file metadata:', metadataError);
      throw metadataError;
    }
    
    // Create or update schema in workflow_file_schemas
    const { error: schemaError } = await supabaseAdmin
      .from('workflow_file_schemas')
      .upsert({
        workflow_id: dbWorkflowId,
        node_id: nodeId,
        file_id: fileId,
        schema: {
          columns: Object.entries(columnDefinitions).map(([name, type]) => ({ name, type })),
          rowCount: dataSummary.totalRows,
          sample: dataSummary.sampleData
        },
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_id,node_id,file_id'
      });
    
    if (schemaError) {
      console.error('Error updating workflow file schema:', schemaError);
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
          schema_created: true,
          column_count: Object.keys(columnDefinitions).length,
          row_count: dataSummary.totalRows
        }
      })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .eq('file_id', fileId);
    
    if (completeError) {
      console.error('Error completing workflow file processing:', completeError);
      throw completeError;
    }
    
    console.log(`Successfully processed file ${fileId} for workflow ${dbWorkflowId}, node ${nodeId}`);
    
    return { 
      success: true, 
      fileId,
      schemaCreated: true,
      columnCount: Object.keys(columnDefinitions).length,
      rowCount: dataSummary.totalRows
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
