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

const MAX_ROWS_PER_CHUNK = 50; // Reduced from 100 to 50 for better memory management
const MAX_PREVIEW_ROWS = 10;  // Only show first 10 rows in preview

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

    // Process Excel file with streaming approach
    const arrayBuffer = await fileBuffer.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { 
      type: 'array',
      cellDates: true,
      cellNF: false,
      cellText: false
    });
    
    // Get first sheet data
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Get headers and total rows
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const totalRows = range.e.r;
    
    // Extract headers
    const headers: string[] = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = worksheet[XLSX.utils.encode_cell({r: 0, c: C})];
      headers.push(cell?.v?.toString() || `Column ${C + 1}`);
    }

    // Get preview data (first few rows)
    const previewData = [];
    for (let R = 1; R <= Math.min(MAX_PREVIEW_ROWS, totalRows); ++R) {
      const row = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = worksheet[XLSX.utils.encode_cell({r: R, c: C})];
        row.push(cell?.v?.toString() || '');
      }
      previewData.push(row);
    }

    // Prepare data summary with memory-efficient approach
    const summary = {
      totalSheets: workbook.SheetNames.length,
      sheetNames: workbook.SheetNames,
      columnCount: headers.length,
      columnNames: headers,
      totalRows: totalRows,
      previewData: previewData,
    };

    // Prepare system message with file summary
    const systemMessage = `You are an AI assistant analyzing an Excel file.
    File Summary:
    - Total Sheets: ${summary.totalSheets}
    - Sheet Names: ${summary.sheetNames.join(', ')}
    - Columns (${summary.columnCount}): ${summary.columnNames.join(', ')}
    - Total Rows: ${summary.totalRows}
    
    The preview data shows the first ${MAX_PREVIEW_ROWS} rows of the file.
    Provide clear, concise analysis based on this data structure.
    If the user asks a specific question, focus on answering that question using the available data.`;

    // Call OpenAI API with optimized prompt
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