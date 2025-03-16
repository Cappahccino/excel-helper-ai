
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.27.0'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

// Define response headers with CORS support
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
}

// Define status constants to prevent typos
const FILE_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error',
  FAILED: 'failed'
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

// Process a specific sheet and extract its schema
async function processSheetSchema(
  workbook: XLSX.WorkBook, 
  sheetName: string, 
  sheetIndex: number
): Promise<{
  name: string,
  index: number,
  columns: string[],
  columnTypes: Record<string, string>,
  sampleData: Record<string, any[]>,
  rowCount: number
}> {
  try {
    // Get the worksheet
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Worksheet '${sheetName}' not found in workbook`);
    }
    
    // Convert worksheet to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Get total rows and prepare result structure
    const rowCount = data.length > 0 ? data.length - 1 : 0;
    const columns: string[] = [];
    const columnTypes: Record<string, string> = {};
    const sampleData: Record<string, any[]> = {};
    
    if (data.length > 0) {
      const headers = data[0];
      
      // Process each column
      for (let colIndex = 0; colIndex < headers.length; colIndex++) {
        // Ensure header is a string and handle empty/null headers
        const header = headers[colIndex] ? String(headers[colIndex]) : `Column ${colIndex + 1}`;
        columns.push(header);
        
        // Get sample values from first 10 rows (or all rows if fewer)
        const sampleValues = [];
        for (let rowIndex = 1; rowIndex < Math.min(data.length, 11); rowIndex++) {
          if (data[rowIndex] && data[rowIndex][colIndex] !== undefined) {
            sampleValues.push(data[rowIndex][colIndex]);
          }
        }
        
        // Detect column type and store sample data
        const type = detectColumnType(sampleValues);
        columnTypes[header] = type;
        sampleData[header] = sampleValues;
      }
    }
    
    return {
      name: sheetName,
      index: sheetIndex,
      columns,
      columnTypes,
      sampleData,
      rowCount
    };
  } catch (error) {
    console.error(`Error processing sheet ${sheetName}:`, error);
    throw error;
  }
}

// Server function to handle file processing
async function processFile(fileId: string, workflowId: string, nodeId: string, requestedSheetName?: string) {
  console.log(`Processing file ${fileId} for workflow ${workflowId}, node ${nodeId}, sheet: ${requestedSheetName || 'all'}`);
  
  try {
    // Normalize the workflow ID
    const dbWorkflowId = normalizeWorkflowId(workflowId);
    const isTemporary = workflowId.startsWith('temp-');
    
    // First, ensure the workflow_files record exists with the processing status
    // This uses UPSERT to create or update the record, avoiding the constraint violation issue
    const { data: workflowFile, error: workflowFileError } = await supabaseAdmin
      .from('workflow_files')
      .upsert({
        workflow_id: dbWorkflowId,
        node_id: nodeId,
        file_id: fileId,
        processing_status: FILE_STATUS.PROCESSING,
        status: FILE_STATUS.QUEUED, // Use valid status value
        is_temporary: isTemporary,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_id,node_id'
      })
      .select()
      .single();
    
    if (workflowFileError) {
      console.error('Error updating workflow file record:', workflowFileError);
      throw workflowFileError;
    }
    
    // Get file information
    const { data: fileInfo, error: fileError } = await supabaseAdmin
      .from('excel_files')
      .select('file_path, filename, mime_type, file_size')
      .eq('id', fileId)
      .single();
      
    if (fileError) {
      console.error('Error fetching file info:', fileError);
      throw new Error(`File information not found: ${fileError.message}`);
    }
    
    if (!fileInfo || !fileInfo.file_path) {
      throw new Error('File path is missing or invalid');
    }
    
    console.log(`Downloading file from path: ${fileInfo.file_path}`);
    
    // Download file from storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from('excel_files')
      .download(fileInfo.file_path);
      
    if (downloadError) {
      console.error('Error downloading file:', downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }
    
    if (!fileData) {
      throw new Error('Downloaded file data is empty or invalid');
    }
    
    // Process file based on mime type
    let sheetsData: any[] = [];
    let dataSummary = {
      numSheets: 0,
      totalRows: 0,
      sheetNames: [] as string[]
    };
    
    // Convert ArrayBuffer to appropriate format for XLSX
    const buffer = await fileData.arrayBuffer();
    
    try {
      console.log('Reading workbook with XLSX...');
      
      // Read the workbook using XLSX
      const workbook = XLSX.read(new Uint8Array(buffer), { 
        type: 'array',
        cellDates: true,
        cellNF: true
      });
      
      console.log(`Workbook read successfully. Sheets found: ${workbook.SheetNames.join(', ')}`);
      
      // Store sheet information
      dataSummary.numSheets = workbook.SheetNames.length;
      dataSummary.sheetNames = workbook.SheetNames;
      
      // Determine which sheet(s) to process
      const sheetsToProcess = requestedSheetName 
        ? [requestedSheetName]  // Process just the requested sheet
        : workbook.SheetNames;  // Process all sheets
      
      if (requestedSheetName && !workbook.SheetNames.includes(requestedSheetName)) {
        throw new Error(`Requested sheet "${requestedSheetName}" not found in the workbook`);
      }
      
      console.log(`Processing sheets: ${sheetsToProcess.join(', ')}`);
      
      // Process each sheet
      for (let i = 0; i < sheetsToProcess.length; i++) {
        const sheetName = sheetsToProcess[i];
        const sheetIndex = workbook.SheetNames.indexOf(sheetName);
        
        if (sheetIndex === -1) continue; // Skip if sheet not found (shouldn't happen)
        
        console.log(`Processing sheet: ${sheetName} (index: ${sheetIndex})`);
        const sheetData = await processSheetSchema(workbook, sheetName, sheetIndex);
        sheetsData.push(sheetData);
        
        // Add to total rows count
        dataSummary.totalRows += sheetData.rowCount;
      }
      
      // Set the default sheet - either the requested one or the first one
      const defaultSheet = requestedSheetName || workbook.SheetNames[0];
      
      // If processing just one sheet, get that sheet's data
      const currentSheetData = sheetsData.find(sheet => sheet.name === defaultSheet);
      
      if (!currentSheetData && sheetsData.length > 0) {
        console.warn(`Requested sheet "${defaultSheet}" not found in processed data`);
      }
      
      // Create or update file metadata with sheet information
      const sheetsMetadata = sheetsData.map(sheet => ({
        name: sheet.name,
        index: sheet.index,
        row_count: sheet.rowCount,
        column_count: sheet.columns.length,
        is_default: sheet.name === defaultSheet
      }));
      
      console.log(`Creating/updating file metadata for ${sheetsMetadata.length} sheets`);
      
      // Create or update file metadata - using proper upsert with the new constraint
      const { data: metadata, error: metadataError } = await supabaseAdmin
        .from('file_metadata')
        .upsert({
          file_id: fileId,
          row_count: dataSummary.totalRows,
          column_definitions: currentSheetData?.columnTypes || {},
          data_summary: dataSummary,
          sheets_metadata: sheetsMetadata,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'file_id'
        })
        .select();
      
      if (metadataError) {
        console.error('Error updating file metadata:', metadataError);
        throw new Error(`Failed to update file metadata: ${metadataError.message}`);
      }
      
      console.log(`Updating workflow_files with sheet information`);
      
      // Update workflow_files with sheet information
      const { error: workflowUpdateError } = await supabaseAdmin
        .from('workflow_files')
        .update({
          metadata: {
            sheets: sheetsMetadata,
            selected_sheet: defaultSheet
          },
          processing_status: FILE_STATUS.COMPLETED,
          status: FILE_STATUS.COMPLETED,
          processing_result: {
            success: true,
            processed_at: new Date().toISOString(),
            sheets_count: sheetsData.length,
            total_row_count: dataSummary.totalRows
          }
        })
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .eq('file_id', fileId);
        
      if (workflowUpdateError) {
        console.error('Error updating workflow file with sheets:', workflowUpdateError);
        throw new Error(`Failed to update workflow file data: ${workflowUpdateError.message}`);
      }
      
      console.log(`Creating/updating schema for ${sheetsData.length} sheets`);
      
      // Remove existing schemas for this workflow/node combination to avoid conflicts
      await supabaseAdmin
        .from('workflow_file_schemas')
        .delete()
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId);
      
      // For each sheet, create a new schema entry in workflow_file_schemas
      for (const sheetData of sheetsData) {
        const { error: schemaError } = await supabaseAdmin
          .from('workflow_file_schemas')
          .insert({
            workflow_id: dbWorkflowId,
            node_id: nodeId,
            file_id: fileId,
            sheet_name: sheetData.name,
            sheet_index: sheetData.index,
            columns: sheetData.columns,
            data_types: sheetData.columnTypes,
            sample_data: Object.entries(sheetData.sampleData).map(([col, samples]) => ({
              column: col,
              samples
            })),
            total_rows: sheetData.rowCount,
            has_headers: true,
            is_temporary: isTemporary,
            updated_at: new Date().toISOString()
          });
          
        if (schemaError) {
          console.error(`Error creating workflow file schema for sheet ${sheetData.name}:`, schemaError);
          throw new Error(`Failed to create schema for sheet ${sheetData.name}: ${schemaError.message}`);
        }
      }
      
      console.log('File processing completed successfully');
      
      return { 
        success: true, 
        fileId,
        filename: fileInfo.filename,
        sheets: sheetsMetadata,
        selectedSheet: defaultSheet,
        totalSheets: sheetsData.length,
        totalRows: dataSummary.totalRows,
        // Include the current sheet's schema if processing a specific sheet
        schema: currentSheetData ? {
          columns: currentSheetData.columns,
          types: currentSheetData.columnTypes
        } : null
      };
    } catch (processingError) {
      console.error('Error processing file content:', processingError);
      throw new Error(`Failed to process file content: ${processingError.message}`);
    }
  } catch (error) {
    console.error('Error in processFile function:', error);
    
    // Update status to error
    try {
      const dbWorkflowId = normalizeWorkflowId(workflowId);
      await supabaseAdmin
        .from('workflow_files')
        .update({
          processing_status: FILE_STATUS.ERROR,
          status: FILE_STATUS.FAILED,
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
    let requestData;
    try {
      requestData = await req.json();
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request data format' }),
        { headers: corsHeaders, status: 400 }
      );
    }
    
    const { fileId, workflowId, nodeId, sheetName } = requestData;
    
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
    
    console.log(`Processing file: ${fileId}, workflow: ${workflowId}, node: ${nodeId}, sheet: ${sheetName || 'default'}`);
    
    // Process the file, optionally with a specific sheet
    const result = await processFile(fileId, workflowId, nodeId, sheetName);
    
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
