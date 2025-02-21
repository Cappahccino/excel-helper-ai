import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Add proper error handling and logging for tag-related operations
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileIds, query, userId, sessionId, messageId, tags } = await req.json();
    console.log('Received request:', { fileIds, query, userId, sessionId, messageId, tags });

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('No file IDs provided');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch files with their associated tags using LEFT JOIN
    const { data: files, error: filesError } = await supabase
      .from('excel_files')
      .select(`
        *,
        message_files!left(
          message_id,
          role,
          message_file_tags!left(
            tag_id,
            ai_context,
            file_tags(
              name,
              type,
              category
            )
          )
        )
      `)
      .in('id', fileIds);

    if (filesError) {
      console.error('Error fetching files:', filesError);
      throw filesError;
    }

    // Process files and their tags
    const processedFiles = files.map(file => {
      const fileTags = file.message_files
        ?.flatMap(mf => mf.message_file_tags)
        .filter(Boolean)
        .map(mft => ({
          name: mft?.file_tags?.name,
          type: mft?.file_tags?.type,
          category: mft?.file_tags?.category,
          context: mft?.ai_context
        }))
        .filter(tag => tag.name) || [];

      return {
        ...file,
        tags: fileTags
      };
    });

    console.log('Processing files with tags:', processedFiles);

    const fileContents = await Promise.all(
      processedFiles.map(async (file) => {
        const { data: fileData, error: storageError } = await supabase
          .storage
          .from('excel-files')
          .download(file.storage_path);

        if (storageError) {
          console.error('Error downloading file:', storageError);
          throw storageError;
        }

        const buffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);

        try {
          if (file.filename.endsWith('.csv')) {
            const decodedString = new TextDecoder('utf-8').decode(uint8Array);
            return decodedString;
          } else {
            const workbook = XLSX.read(uint8Array, { type: 'array' });
            return JSON.stringify(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]));
          }
        } catch (parsingError) {
          console.error('Error parsing file:', parsingError);
          throw parsingError;
        }
      })
    );

    const prompt = `
      You are an AI assistant that helps users analyze Excel files.
      You will be given a query and the content of one or more Excel files.
      Your goal is to answer the query based on the content of the Excel files.
      Here are the files with their content:
      ${processedFiles.map((file, index) => `Filename: ${file.filename}, Tags: ${JSON.stringify(file.tags)}, Content: ${fileContents[index]}`).join('\n')}
      Query: ${query}
      Response:
    `;

    const openAiUrl = 'https://api.openai.com/v1/chat/completions';
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAiApiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const chatCompletion = await fetch(openAiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!chatCompletion.ok) {
      console.error('OpenAI API error:', chatCompletion.status, chatCompletion.statusText, await chatCompletion.text());
      throw new Error(`OpenAI API error: ${chatCompletion.status} ${chatCompletion.statusText}`);
    }

    const data = await chatCompletion.json();
    const answer = data.choices[0].message.content;

    // Update the message with processing information
    const { error: updateError } = await supabase
      .from('chat_messages')
      .update({
        status: 'in_progress',
        processing_stage: {
          stage: 'processing',
          started_at: Date.now(),
          last_updated: Date.now()
        }
      })
      .eq('id', messageId);

    if (updateError) {
      console.error('Error updating message status:', updateError);
      throw updateError;
    }

    const { error: completionError } = await supabase
      .from('chat_messages')
      .update({
        content: answer,
        status: 'completed',
        metadata: {
          processing_stage: {
            stage: 'completion',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId);

    if (completionError) {
      console.error('Error updating message:', completionError);
      throw completionError;
    }

    return new Response(
      JSON.stringify({ data: answer }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in excel-assistant:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
