
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    console.log('Starting excel-assistant function...');
    const { fileIds, query, userId, sessionId, messageId } = await req.json();
    
    if (!fileIds || fileIds.length === 0) {
      throw new Error('No file IDs provided');
    }

    console.log('Processing files:', fileIds);
    const fileContents = [];

    // Process each file
    for (const fileId of fileIds) {
      console.log(`Processing file ${fileId}...`);
      
      // Get file metadata from database
      const { data: file, error: fileError } = await supabaseClient
        .from('excel_files')
        .select('*')
        .eq('id', fileId)
        .single();

      if (fileError) {
        console.error('Error fetching file metadata:', fileError);
        throw fileError;
      }

      // Download file from storage
      console.log(`Downloading file ${file.file_path}...`);
      const { data: fileData, error: downloadError } = await supabaseClient.storage
        .from('excel_files')
        .download(file.file_path);

      if (downloadError) {
        console.error('Error downloading file:', downloadError);
        throw downloadError;
      }

      // Convert file to array buffer
      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Parse Excel file
      console.log('Parsing Excel file...');
      const workbook = XLSX.read(uint8Array, { type: 'array' });
      
      // Process each sheet
      const sheetNames = workbook.SheetNames;
      const fileInfo = {
        filename: file.filename,
        sheets: sheetNames.map(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          return {
            name: sheetName,
            rowCount: data.length,
            columnCount: data[0]?.length || 0,
            preview: data.slice(0, 5)
          };
        })
      };

      fileContents.push(fileInfo);
    }

    // Prepare prompt for OpenAI
    const systemPrompt = `You are an Excel expert assistant. Analyze the following Excel files and respond to the user's query.
File information:
${fileContents.map(file => `
Filename: ${file.filename}
Sheets: ${file.sheets.map(sheet => `
  - ${sheet.name} (${sheet.rowCount} rows × ${sheet.columnCount} columns)
  Preview: ${JSON.stringify(sheet.preview)}`).join('\n')}
`).join('\n')}`;

    console.log('Calling OpenAI API...');
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
      }),
    });

    if (!openAIResponse.ok) {
      const error = await openAIResponse.text();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error}`);
    }

    const aiResponse = await openAIResponse.json();
    const responseContent = aiResponse.choices[0].message.content;

    // Update the message in the database
    const { error: updateError } = await supabaseClient
      .from('chat_messages')
      .update({ 
        content: responseContent,
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', messageId);

    if (updateError) {
      console.error('Error updating message:', updateError);
      throw updateError;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Analysis completed successfully',
      content: responseContent
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in excel-assistant function:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to process Excel files',
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
