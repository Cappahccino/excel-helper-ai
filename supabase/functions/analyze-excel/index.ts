import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, userPrompt, file } = await req.json();
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    let analysis = '';
    
    // If there's a file, analyze it first
    if (fileContent) {
      console.log('Processing file analysis');
      
      // Convert base64 to binary
      const base64Data = fileContent.split(',')[1];
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      // Parse Excel data
      const workbook = XLSX.read(binaryData, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Convert data to string format for OpenAI
      const headers = jsonData[0];
      const sampleData = jsonData.slice(1, 6); // Take first 5 rows as sample
      const dataPreview = `
        Headers: ${headers.join(', ')}
        Sample rows:
        ${sampleData.map(row => row.join(', ')).join('\n')}
      `;

      // Get initial file analysis from OpenAI
      const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at analyzing Excel data. Explain what data this file contains in a clear, concise way.'
            },
            {
              role: 'user',
              content: `Here's the Excel data:\n${dataPreview}\n\nExplain what data this file contains.`
            }
          ],
        }),
      });

      const analysisData = await analysisResponse.json();
      analysis = analysisData.choices[0].message.content;
    }

    // If there's a specific user prompt, get additional analysis
    if (userPrompt) {
      const promptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at analyzing Excel data and answering questions about it.'
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
        }),
      });

      const promptData = await promptResponse.json();
      const promptAnalysis = promptData.choices[0].message.content;
      analysis = analysis ? `${analysis}\n\nAnswering your question: ${promptAnalysis}` : promptAnalysis;
    }

    // Store file if provided
    if (file && fileContent) {
      const userId = file.userId;
      const filePath = `${userId}/${crypto.randomUUID()}-${file.name}`;
      
      // Convert base64 to Uint8Array for storage
      const base64Data = fileContent.split(',')[1];
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

      // Upload file to Storage
      const { error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, binaryData, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        console.error('File upload error:', uploadError);
        throw new Error('Failed to upload file');
      }

      // Save file metadata to database
      const { error: dbError } = await supabase
        .from('excel_files')
        .insert({
          user_id: userId,
          filename: file.name,
          file_path: filePath,
          file_size: file.size
        });

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error('Failed to save file metadata');
      }
    }

    return new Response(
      JSON.stringify({ analysis, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-excel function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});