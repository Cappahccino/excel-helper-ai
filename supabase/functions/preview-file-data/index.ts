
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
    
    // 3. Check if we already have sample data in the metadata
    if (metaData?.data_summary?.sample_data && Array.isArray(metaData.data_summary.sample_data)) {
      const sampleData = metaData.data_summary.sample_data.slice(0, maxRows);
      const columns = metaData.column_definitions 
        ? Object.keys(metaData.column_definitions)
        : (sampleData.length > 0 ? Object.keys(sampleData[0]) : []);
      
      console.log(`Returning ${sampleData.length} sample rows from metadata`);
      
      return new Response(
        JSON.stringify({ 
          data: sampleData,
          columns,
          source: 'metadata',
          file_id: fileId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 4. If we don't have sample data in metadata, check if we have it in workflow_file_schemas
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
    
    // 5. If we still don't have data, fetch a sample from the actual file
    // This would normally require accessing the file storage, but for this example,
    // we'll just return an empty array with a notification
    
    console.log('No sample data available, would need to fetch from storage');
    
    return new Response(
      JSON.stringify({ 
        data: [],
        columns: [],
        source: 'none',
        file_id: fileId,
        error: 'No sample data available for this file'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error processing request:', error.message);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
})
