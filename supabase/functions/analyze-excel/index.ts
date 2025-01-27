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

  try {
    console.log('Received request to analyze-excel function');
    const { fileContent, userPrompt, file } = await req.json();
    
    if (!fileContent || !file) {
      console.error('No file content or file metadata provided');
      return new Response(
        JSON.stringify({ error: 'No file content or metadata provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Processing file:', file.name);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
      // Convert base64 to binary
      const binaryString = atob(fileContent);
      const binaryData = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        binaryData[i] = binaryString.charCodeAt(i);
      }
      
      // Generate a unique file path
      const filePath = `${file.userId}/${crypto.randomUUID()}-${file.name}`;

      console.log('Uploading file to storage:', filePath);

      // Upload file to Storage
      const { error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, binaryData, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error('Failed to upload file to storage');
      }

      // Save file metadata to database
      const { error: dbError } = await supabase
        .from('excel_files')
        .insert({
          user_id: file.userId,
          filename: file.name,
          file_path: filePath,
          file_size: file.size
        });

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error('Failed to save file metadata');
      }

      // Parse Excel data for analysis
      const workbook = XLSX.read(binaryData, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Prepare data preview for OpenAI
      const headers = jsonData[0];
      const sampleData = jsonData.slice(1, 6); // Take first 5 rows as sample
      const dataPreview = `
        Headers: ${headers.join(', ')}
        Sample rows:
        ${sampleData.map(row => row.join(', ')).join('\n')}
      `;

      console.log('Analyzing data with OpenAI');

      // Get analysis from OpenAI
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at analyzing Excel data. Explain what data this file contains in a clear, concise way.'
            },
            {
              role: 'user',
              content: `Here's the Excel data:\n${dataPreview}\n\nUser's question: ${userPrompt || 'Explain what data this file contains.'}`
            }
          ],
        }),
      });

      if (!openAIResponse.ok) {
        console.error('OpenAI API error:', await openAIResponse.text());
        throw new Error('Failed to analyze file content');
      }

      const analysisData = await openAIResponse.json();
      const analysis = analysisData.choices[0].message.content;

      return new Response(
        JSON.stringify({ success: true, analysis }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      console.error('Error processing file:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to process file: ' + error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in analyze-excel function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});