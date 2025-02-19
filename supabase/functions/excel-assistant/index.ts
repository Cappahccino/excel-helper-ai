
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '@supabase/supabase-js';
import { ChatGPTAPI } from "npm:chatgpt@5.2.5";
import { RequestBody, ProcessedFileContext } from "./types.ts";
import { validateExcelFile, processExcelFiles } from "./excel.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json() as RequestBody;
    const { files, query, userId, sessionId, messageId } = body;

    if (!query?.trim()) {
      throw new Error("Query cannot be empty");
    }

    let fileContexts: ProcessedFileContext[] = [];

    if (files && files.length > 0) {
      // Process all files in parallel
      const filePromises = files.map(async (file) => {
        if (!file.fileId) return null;

        const { data: fileData } = await supabase
          .from('excel_files')
          .select('filename, file_path')
          .eq('id', file.fileId)
          .single();

        if (!fileData) return null;

        const excelData = await processExcelFiles(supabase, file.fileId);
        if (!excelData) return null;

        return {
          fileId: file.fileId,
          fileName: fileData.filename,
          systemRole: file.systemRole || 'unspecified',
          tags: file.tags?.filter(tag => tag && tag.trim()) || [],
          data: excelData
        };
      });

      fileContexts = (await Promise.all(filePromises)).filter((context): context is ProcessedFileContext => context !== null);
    }

    // Build context based on files
    const contextBuilder = (contexts: ProcessedFileContext[]) => {
      if (contexts.length === 0) return "No files provided.";

      return contexts.map(context => {
        const roleInfo = `Role: ${context.systemRole}`;
        const tagInfo = context.tags.length > 0 
          ? `Tags: ${context.tags.join(', ')}`
          : 'No tags';
        
        return `File "${context.fileName}" (${roleInfo}, ${tagInfo}):\n${JSON.stringify(context.data)}`;
      }).join('\n\n');
    };

    const systemPrompt = `You are an Excel assistant that helps users analyze data. 
    ${fileContexts.length > 0 
      ? `You have access to ${fileContexts.length} Excel file(s):\n${contextBuilder(fileContexts)}`
      : 'No files are provided for this query.'
    }`;

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

    return new Response(JSON.stringify({ response: response.text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
