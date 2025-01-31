import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExcelAnalysisRequest {
  fileId: string;
  query?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, query } = await req.json() as ExcelAnalysisRequest;
    console.log('Processing file:', fileId, 'with query:', query);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get file metadata from database
    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !fileData) {
      console.error('Error fetching file data:', fileError);
      throw new Error('File not found');
    }

    // Download file from storage
    const { data: fileBuffer, error: downloadError } = await supabase
      .storage
      .from('excel_files')
      .download(fileData.file_path);

    if (downloadError) {
      console.error('Error downloading file:', downloadError);
      throw new Error('Error downloading file');
    }

    // Process Excel file
    const arrayBuffer = await fileBuffer.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    
    // Get first sheet data
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON with chunking (max 100 rows)
    const allData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const headers = allData[0] as string[];
    const dataRows = allData.slice(1);
    
    // Process in chunks of 100 rows
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < dataRows.length; i += chunkSize) {
      chunks.push(dataRows.slice(i, i + chunkSize));
    }

    // Prepare data summary
    const summary = {
      totalSheets: workbook.SheetNames.length,
      sheetNames: workbook.SheetNames,
      columnCount: headers.length,
      columnNames: headers,
      totalRows: dataRows.length,
      sampleData: chunks[0], // First chunk for initial analysis
    };

    // Prepare system message with file summary
    const systemMessage = `You are an AI assistant analyzing an Excel file.
    File Summary:
    - Total Sheets: ${summary.totalSheets}
    - Sheet Names: ${summary.sheetNames.join(', ')}
    - Columns (${summary.columnCount}): ${summary.columnNames.join(', ')}
    - Total Rows: ${summary.totalRows}
    
    Provide clear, concise analysis based on this data structure.
    If the user asks a specific question, focus on answering that question using the available data.`;

    // Call OpenAI API
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: query || 'Please provide a brief summary of this Excel file and its contents.' }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!openAIResponse.ok) {
      console.error('OpenAI API error:', await openAIResponse.text());
      throw new Error('OpenAI API error');
    }

    const aiData = await openAIResponse.json();
    const analysis = aiData.choices[0].message.content;

    // Store the analysis in chat_messages using background task
    EdgeRuntime.waitUntil(
      supabase
        .from('chat_messages')
        .insert({
          excel_file_id: fileId,
          content: analysis,
          is_ai_response: true,
          user_id: fileData.user_id,
        })
        .then(({ error }) => {
          if (error) console.error('Error storing analysis:', error);
        })
    );

    // Update last_accessed timestamp
    EdgeRuntime.waitUntil(
      supabase
        .from('excel_files')
        .update({ last_accessed: new Date().toISOString() })
        .eq('id', fileId)
        .then(({ error }) => {
          if (error) console.error('Error updating last_accessed:', error);
        })
    );

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-excel function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});