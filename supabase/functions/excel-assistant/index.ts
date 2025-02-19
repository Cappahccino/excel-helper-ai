
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
    const { files, query, userId, sessionId, messageId } = body;

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

    // Process files if present
    let fileContexts: ProcessedFileContext[] = [];
    if (files && files.length > 0) {
      console.log(`Processing ${files.length} files...`);

      const filePromises = files.map(async (file) => {
        if (!file.fileId) {
          console.warn('Skipping file with missing ID');
          return null;
        }

        try {
          // Validate file exists and is accessible
          const isValid = await validateExcelFile(supabase, file.fileId);
          if (!isValid) {
            console.warn(`File ${file.fileId} is not valid or accessible`);
            return null;
          }

          // Get file metadata
          const { data: fileData, error: fileError } = await supabase
            .from('excel_files')
            .select('filename, file_path')
            .eq('id', file.fileId)
            .maybeSingle();

          if (fileError || !fileData) {
            console.error(`Error fetching file metadata for ${file.fileId}:`, fileError);
            return null;
          }

          // Process Excel data
          const excelData = await processExcelFiles(supabase, file.fileId);
          if (!excelData) {
            console.warn(`No data processed for file ${file.fileId}`);
            return null;
          }

          // Clean and validate tags
          const validTags = (file.tags || [])
            .map(tag => tag?.trim())
            .filter((tag): tag is string => !!tag);

          return {
            fileId: file.fileId,
            fileName: fileData.filename,
            systemRole: file.systemRole || 'unspecified',
            tags: validTags,
            data: excelData
          };
        } catch (error) {
          console.error(`Error processing file ${file.fileId}:`, error);
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
        const roleInfo = `Role: ${context.systemRole}`;
        const tagInfo = context.tags.length > 0 
          ? `Tags: ${context.tags.join(', ')}`
          : 'No tags specified';
        
        const dataPreview = context.data.map(sheet => ({
          sheetName: sheet.sheet,
          headers: sheet.headers,
          rowCount: sheet.data.length,
          sampleData: sheet.data.slice(0, 3) // Show first 3 rows as preview
        }));
        
        return `File: "${context.fileName}"\n` +
               `${roleInfo}\n` +
               `${tagInfo}\n` +
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

    const response = await api.sendMessage(query, {
      systemMessage: systemPrompt,
    });

    console.log('AI response received');

    return new Response(
      JSON.stringify({ 
        response: response.text,
        processedFiles: fileContexts.length,
        timestamp: new Date().toISOString()
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in excel-assistant function:', error);
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
