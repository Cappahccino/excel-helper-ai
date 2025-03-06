
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as XLSX from 'npm:xlsx@0.18.5';
import OpenAI from 'npm:openai';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `
You are an Excel data analyst assistant. Your role is to:
- Provide clear, concise insights from Excel data
- Focus on relevant patterns and trends
- Use numerical evidence to support conclusions
- Highlight notable outliers or anomalies
- Format responses for readability
Please present your analysis in a structured way using clear sections and proper formatting.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, query, userId, threadId } = await req.json();
    console.log('Processing request for:', { fileId, userId, threadId });

    if (!fileId || !query || !userId || !threadId) {
      throw new Error('Missing required fields: fileId, query, userId, and threadId are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY')
    });

    // Get file metadata from database
    const { data: fileData, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !fileData) {
      console.error('Error fetching file data:', fileError);
      throw new Error(fileError?.message || 'File not found');
    }

    // Download file from storage - note bucket name case sensitivity
    const { data: fileContent, error: downloadError } = await supabase.storage
      .from('excel_files') // Correct bucket name casing
      .download(fileData.file_path);

    if (downloadError) {
      console.error('Error downloading file:', downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Process Excel file
    console.log('Processing Excel file');
    const workbook = XLSX.read(await fileContent.arrayBuffer());
    if (!workbook.SheetNames.length) {
      throw new Error('Excel file contains no sheets');
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    const limitedData = jsonData.slice(0, 50); // Analyze first 50 rows

    // Get OpenAI analysis
    console.log('Requesting OpenAI analysis');
    const openAiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { 
          role: "user", 
          content: `Analyze this Excel data (showing first 50 rows): ${JSON.stringify(limitedData)}. Query: ${query}` 
        }
      ],
      max_tokens: 1000
    });

    console.log('OpenAI response received');

    // Store messages
    const { error: messagesError } = await supabase
      .from('chat_messages')
      .insert([
        {
          thread_id: threadId,
          content: query,
          is_ai_response: false,
          user_id: userId,
          excel_file_id: fileId,
          chat_id: openAiResponse.id
        },
        {
          thread_id: threadId,
          content: openAiResponse.choices[0].message.content,
          is_ai_response: true,
          user_id: userId,
          excel_file_id: fileId,
          chat_id: openAiResponse.id,
          openai_model: openAiResponse.model,
          openai_usage: openAiResponse.usage,
          raw_response: openAiResponse
        }
      ]);

    if (messagesError) {
      throw new Error(`Failed to store messages: ${messagesError.message}`);
    }

    return new Response(
      JSON.stringify({
        threadId: threadId,
        message: openAiResponse.choices[0].message.content,
        model: openAiResponse.model,
        usage: openAiResponse.usage
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in analyze-excel function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    );
  }
});
