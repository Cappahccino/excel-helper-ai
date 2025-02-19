
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { ChatGPTAPI } from "npm:chatgpt@5.2.5";
import { validateExcelFile, processExcelFiles } from "./excel.ts";
import { RequestBody, ProcessedFileContext } from "./types.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse and validate request
    const body = await req.json() as RequestBody;
    const { fileIds, query, userId, sessionId, messageId } = body;

    console.log('Processing request:', { fileIds, query, sessionId, messageId });

    // Validate required fields
    if (!query?.trim()) {
      return new Response(
        JSON.stringify({ error: "Query cannot be empty" }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "User ID is required" }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update message to show processing state
    await supabase
      .from('chat_messages')
      .update({
        metadata: {
          processing_stage: {
            stage: 'processing',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId);

    // Process files if present
    let fileContexts: ProcessedFileContext[] = [];
    if (fileIds && fileIds.length > 0) {
      console.log(`Processing ${fileIds.length} files...`);

      const filePromises = fileIds.map(async (fileId) => {
        if (!fileId) {
          console.warn('Skipping file with missing ID');
          return null;
        }

        try {
          // Validate file exists and is accessible
          const isValid = await validateExcelFile(supabase, fileId);
          if (!isValid) {
            console.warn(`File ${fileId} is not valid or accessible`);
            return null;
          }

          // Get file metadata
          const { data: fileData, error: fileError } = await supabase
            .from('excel_files')
            .select('filename, file_path')
            .eq('id', fileId)
            .maybeSingle();

          if (fileError || !fileData) {
            console.error(`Error fetching file metadata for ${fileId}:`, fileError);
            return null;
          }

          // Process Excel data
          const excelData = await processExcelFiles(supabase, fileId);
          if (!excelData) {
            console.warn(`No data processed for file ${fileId}`);
            return null;
          }

          return {
            fileId,
            fileName: fileData.filename,
            data: excelData
          };
        } catch (error) {
          console.error(`Error processing file ${fileId}:`, error);
          return null;
        }
      });

      // Wait for all file processing to complete
      const results = await Promise.all(filePromises);
      fileContexts = results.filter((context): context is ProcessedFileContext => context !== null);
      
      console.log(`Successfully processed ${fileContexts.length} files`);
    }

    // Build AI context
    const contextBuilder = (contexts: ProcessedFileContext[]) => {
      if (contexts.length === 0) return "No files are currently being analyzed.";

      return contexts.map(context => {
        const dataPreview = context.data.map(sheet => ({
          sheetName: sheet.sheet,
          headers: sheet.headers,
          rowCount: sheet.data.length,
          sampleData: sheet.data.slice(0, 3) // Show first 3 rows as preview
        }));
        
        return `File: "${context.fileName}"\n` +
               `Data Preview:\n${JSON.stringify(dataPreview, null, 2)}`;
      }).join('\n\n');
    };

    // Construct system prompt
    const systemPrompt = `You are an Excel data analysis assistant.
    
Your task: ${query.trim()}

Available Data:
${fileContexts.length > 0 
  ? `I have access to ${fileContexts.length} Excel file(s):\n\n${contextBuilder(fileContexts)}`
  : 'No files have been provided for analysis. I will answer based on general Excel knowledge.'
}

Please provide a clear and structured response to help the user understand their data.`;

    console.log('Sending request to AI...');

    // Initialize AI client and send request
    const api = new ChatGPTAPI({
      apiKey: Deno.env.get('OPENAI_API_KEY')!,
      completionParams: {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        top_p: 1,
      },
    });

    // Get AI response
    const response = await api.sendMessage(query, {
      systemMessage: systemPrompt,
    });

    console.log('AI response received, updating message...');

    // Update the assistant message with the response
    const { error: updateError } = await supabase
      .from('chat_messages')
      .update({
        content: response.text,
        status: 'completed',
        metadata: {
          processing_stage: {
            stage: 'completed',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId);

    if (updateError) {
      console.error('Error updating message:', updateError);
      throw updateError;
    }

    console.log('Message updated successfully');

    return new Response(
      JSON.stringify({ 
        response: response.text,
        messageId,
        status: 'completed',
        timestamp: new Date().toISOString()
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in excel-assistant function:', error);

    // Update message status to failed if there's an error
    if (error instanceof Error) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      try {
        const { body } = req as { body: RequestBody };
        const messageId = body?.messageId;

        if (messageId) {
          await supabase
            .from('chat_messages')
            .update({
              status: 'failed',
              content: 'An error occurred while processing your request.',
              metadata: {
                error: error.message,
                processing_stage: {
                  stage: 'failed',
                  last_updated: Date.now()
                }
              }
            })
            .eq('id', messageId);
        }
      } catch (updateError) {
        console.error('Error updating failed message status:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ 
        error: "An error occurred while processing your request",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
