
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import * as XLSX from "https://esm.sh/xlsx@0.18.5"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FileAnalysis {
  fileId: string;
  filename: string;
  data: Record<string, any>[];
  metadata: {
    columns: string[];
    rowCount: number;
    tags: { name: string; aiContext: string | null }[];
    role?: string;
  };
}

async function processFile(supabase: any, fileId: string): Promise<FileAnalysis> {
  console.log('Processing file:', fileId);
  
  // Use LEFT JOIN instead of INNER JOIN to handle files without tags
  const { data: file, error: fileError } = await supabase
    .from('excel_files')
    .select(`
      *,
      message_files(
        message_id,
        role,
        message_file_tags(
          tag_id,
          ai_context,
          file_tags(
            name
          )
        )
      )
    `)
    .eq('id', fileId)
    .single();

  if (fileError) {
    console.error('File fetch error:', fileError);
    throw new Error(`Failed to fetch file info: ${fileError.message}`);
  }

  const { data: fileData, error: downloadError } = await supabase
    .storage
    .from('excel_files')
    .download(file.file_path);

  if (downloadError) {
    console.error('File download error:', downloadError);
    throw new Error(`Failed to download file: ${downloadError.message}`);
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);

  // Safely extract tags, handling the case where there are no tags
  const messagefile = file.message_files?.[0];
  const tags = messagefile?.message_file_tags?.map((tag: any) => ({
    name: tag.file_tags.name,
    aiContext: tag.ai_context
  })) || [];

  console.log('File processed:', {
    fileId,
    filename: file.filename,
    tagsCount: tags.length,
    rowCount: jsonData.length
  });

  return {
    fileId,
    filename: file.filename,
    data: jsonData,
    metadata: {
      columns: Object.keys(jsonData[0] || {}),
      rowCount: jsonData.length,
      tags,
      role: messagefile?.role
    }
  };
}

function buildSystemMessage(
  fileAnalysis: FileAnalysis[],
  previousMessages: Array<{ content: string; role: string }>,
  currentQuery: string
): string {
  // Build context from files with enhanced data summarization
  const fileContexts = fileAnalysis.map(file => {
    const { filename, metadata, data } = file;
    const dataSummary = summarizeData(data);
    
    // Handle both tagged and untagged files
    let tagContext = '';
    if (metadata.tags.length > 0) {
      tagContext = metadata.tags
        .map(tag => `${tag.name}${tag.aiContext ? `: ${tag.aiContext}` : ''}`)
        .join('\n');
    } else {
      tagContext = 'No tags assigned to this file';
    }

    const roleContext = metadata.role 
      ? `Role: ${metadata.role}`
      : 'No specific role assigned';

    return `
File: ${filename}
${roleContext}
Columns: ${metadata.columns.join(', ')}
Row count: ${metadata.rowCount}
Statistical Summary:
${JSON.stringify(dataSummary, null, 2)}
Tags:
${tagContext}
Sample data:
${JSON.stringify(data.slice(0, 3), null, 2)}
    `.trim();
  }).join('\n\n');

  // Build conversation context
  const conversationContext = previousMessages
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');

  return `
You are an expert data analyst analyzing Excel files. You have access to the following data sources:

${fileContexts}

Previous conversation context:
${conversationContext}

Current user query: "${currentQuery}"

Instructions:
1. Analyze all provided files thoroughly, whether they have tags or not
2. If comparing multiple files, highlight relationships and patterns
3. Provide specific insights from the data
4. Use concrete numbers and examples from the data
5. Format your response in a clear, structured way
6. For untagged files, focus on the content and statistical analysis

Remember to focus on the specific data provided and the user's query.
  `.trim();
}

function summarizeData(data: any[]) {
  if (!data || data.length === 0) {
    return {
      rowCount: 0,
      columns: [],
      numeric_columns: {}
    };
  }

  const numericColumns = Object.keys(data[0]).filter(key => 
    typeof data[0][key] === 'number'
  );

  const summary: any = {
    rowCount: data.length,
    columns: Object.keys(data[0]),
    numeric_columns: {}
  };

  numericColumns.forEach(col => {
    const values = data.map(row => row[col]).filter(v => typeof v === 'number');
    if (values.length) {
      summary.numeric_columns[col] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      };
    }
  });

  return summary;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let currentStage = 'initialization';

  try {
    const { fileIds, query, userId, sessionId, messageId } = await req.json();
    console.log('Processing request:', { fileIds, query, messageId });

    if (!fileIds?.length && !query?.trim()) {
      throw new Error('Either files or a query must be provided');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Handle case with no files
    if (!fileIds?.length) {
      console.log('No files provided, handling general query');
      const response = await handleGeneralQuery(query);
      await updateMessageWithResponse(supabase, messageId, response);
      return new Response(JSON.stringify({ message: 'Analysis complete' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Process files and collect analysis
    currentStage = 'file_processing';
    console.log('Starting file processing:', fileIds);
    
    const fileAnalysis: FileAnalysis[] = [];
    const totalFiles = fileIds.length;
    
    for (let i = 0; i < fileIds.length; i++) {
      const progress = ((i + 1) / totalFiles) * 100;
      await updateMessageStatus(supabase, messageId, {
        stage: 'processing_files',
        details: `Processing file ${i + 1} of ${totalFiles}`,
        progress
      });
      
      const analysis = await processFile(supabase, fileIds[i]);
      fileAnalysis.push(analysis);
    }

    // Get previous context
    currentStage = 'context_building';
    const { data: previousMessages } = await supabase
      .from('chat_messages')
      .select('content, role')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Build system message with context
    const systemMessage = buildSystemMessage(fileAnalysis, previousMessages || [], query);
    
    // Get AI analysis
    currentStage = 'ai_analysis';
    await updateMessageStatus(supabase, messageId, {
      stage: 'generating',
      details: 'Generating AI analysis...',
      progress: 0
    });

    console.log('Sending request to OpenAI...');
    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-turbo',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: query }
        ],
        temperature: 0.7,
      }),
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const aiData = await openAiResponse.json();
    const analysis = aiData.choices[0].message.content;

    // Update message with final response
    await updateMessageWithResponse(supabase, messageId, analysis);

    return new Response(
      JSON.stringify({ message: 'Analysis complete' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`Error in stage ${currentStage}:`, error);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    await supabase
      .from('chat_messages')
      .update({
        content: `An error occurred while ${currentStage}: ${error.message}`,
        status: 'failed',
        metadata: {
          processing_stage: {
            stage: 'failed',
            error: error.message,
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId);

    return new Response(
      JSON.stringify({ 
        error: 'Failed to process request', 
        stage: currentStage,
        details: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    );
  }
});

async function handleGeneralQuery(query: string): Promise<string> {
  console.log('Handling general query without files');
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an expert data analyst. The user has not provided any Excel files for analysis, 
but has asked a general question. Provide helpful guidance or explanations about data analysis concepts.
Please be specific and practical in your response, using examples where appropriate.`
        },
        { role: 'user', content: query }
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function updateMessageStatus(supabase: any, messageId: string, stage: {
  stage: string;
  details: string;
  progress: number;
}) {
  await supabase
    .from('chat_messages')
    .update({
      status: 'in_progress',
      metadata: {
        processing_stage: {
          ...stage,
          started_at: Date.now(),
          last_updated: Date.now()
        }
      }
    })
    .eq('id', messageId);
}

async function updateMessageWithResponse(supabase: any, messageId: string, content: string) {
  await supabase
    .from('chat_messages')
    .update({
      content,
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
}

