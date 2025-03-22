
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.37.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Create a Supabase client with the admin key
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { fileId, maxRows = 10 } = await req.json();
    
    if (!fileId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: fileId' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    console.log(`Fetching preview data for file: ${fileId}, max rows: ${maxRows}`);
    
    // 1. First, get the file info from the database
    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single();
      
    if (fileError) {
      console.error('Error fetching file data:', fileError);
      return new Response(
        JSON.stringify({ error: `Failed to fetch file: ${fileError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    if (!fileData) {
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }
    
    // 2. Get file metadata that contains schema information
    const { data: metaData, error: metaError } = await supabase
      .from('file_metadata')
      .select('*')
      .eq('file_id', fileId)
      .single();
      
    if (metaError && metaError.code !== 'PGRST116') { // Not found is OK
      console.error('Error fetching file metadata:', metaError);
      return new Response(
        JSON.stringify({ error: `Failed to fetch file metadata: ${metaError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    // 3. Check if we have data in the updated metadata format
    if (metaData?.data_summary && Array.isArray(metaData.data_summary)) {
      // New format from the updated excel-assistant
      const sampleData = metaData.data_summary.slice(0, maxRows);
      const columns = metaData.column_definitions 
        ? Object.keys(metaData.column_definitions)
        : (sampleData.length > 0 ? Object.keys(sampleData[0]) : []);
      
      console.log(`Returning ${sampleData.length} sample rows from updated metadata format`);
      
      return new Response(
        JSON.stringify({ 
          data: sampleData,
          columns,
          source: 'metadata_new',
          file_id: fileId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 4. Check if we have data in the legacy metadata format
    if (metaData?.data_summary?.sample_data && Array.isArray(metaData.data_summary.sample_data)) {
      // Legacy format
      const sampleData = metaData.data_summary.sample_data.slice(0, maxRows);
      const columns = metaData.column_definitions 
        ? Object.keys(metaData.column_definitions)
        : (sampleData.length > 0 ? Object.keys(sampleData[0]) : []);
      
      console.log(`Returning ${sampleData.length} sample rows from legacy metadata format`);
      
      return new Response(
        JSON.stringify({ 
          data: sampleData,
          columns,
          source: 'metadata_legacy',
          file_id: fileId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 5. If we don't have sample data in metadata, check if we have it in workflow_file_schemas
    const { data: schemaData, error: schemaError } = await supabase
      .from('workflow_file_schemas')
      .select('*')
      .eq('file_id', fileId)
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (schemaError) {
      console.error('Error fetching schema data:', schemaError);
      return new Response(
        JSON.stringify({ error: `Failed to fetch schema data: ${schemaError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    if (schemaData && schemaData.length > 0 && schemaData[0].sample_data) {
      const sampleData = schemaData[0].sample_data.slice(0, maxRows);
      const columns = schemaData[0].columns || [];
      
      console.log(`Returning ${sampleData.length} sample rows from workflow schema`);
      
      return new Response(
        JSON.stringify({ 
          data: sampleData,
          columns,
          source: 'workflow_schema',
          file_id: fileId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 6. As a final fallback, fetch the actual file from storage and process it
    console.log('No sample data available, fetching from storage');
    
    try {
      // Get file path
      const filePath = fileData.file_path;
      
      // Download file from storage
      const { data: fileContent, error: downloadError } = await supabase.storage
        .from('excel_files')
        .download(filePath);
        
      if (downloadError) {
        throw downloadError;
      }
      
      // We need to dynamically import XLSX
      const XLSX = await import('https://esm.sh/xlsx@0.18.5');
      
      // Process file
      const arrayBuffer = await fileContent.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert to JSON with headers
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (!jsonData || jsonData.length <= 1) {
        throw new Error('No data found in Excel file');
      }
      
      const headers = jsonData[0] as string[];
      const rows = jsonData.slice(1, maxRows + 1);
      
      // Transform data to match expected format
      const sampleData = rows.map(row => {
        const rowData: Record<string, any> = {};
        headers.forEach((header, index) => {
          rowData[header] = row[index];
        });
        return rowData;
      });
      
      console.log(`Processed ${sampleData.length} rows directly from file`);
      
      return new Response(
        JSON.stringify({ 
          data: sampleData,
          columns: headers,
          source: 'file_direct',
          file_id: fileId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (fileError) {
      console.error('Error processing file from storage:', fileError);
      
      return new Response(
        JSON.stringify({ 
          data: [],
          columns: [],
          source: 'none',
          file_id: fileId,
          error: `Failed to process file: ${fileError.message}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
  } catch (error) {
    console.error('Error processing request:', error.message);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
})
