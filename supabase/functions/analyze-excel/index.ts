import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

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

    let systemPrompt = 'You are a helpful assistant that can analyze data and answer general questions.';
    let userMessage = userPrompt;

    // If there's a file, store it and include its content in the analysis
    if (file && fileContent) {
      console.log('Processing file upload:', file.name);
      
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
          file_size: binaryData.length
        });

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error('Failed to save file metadata');
      }

      systemPrompt = 'You are an AI assistant that specializes in analyzing Excel files and data. Provide clear, concise insights based on the file content.';
      userMessage = `I have uploaded an Excel file named "${file.name}" with the following content:\n\n${fileContent}\n\nMy question is: ${userPrompt}`;
    }

    // Send to OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
      }),
    });

    const data = await response.json();
    const analysis = data.choices[0].message.content;

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