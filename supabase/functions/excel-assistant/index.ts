
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { fileIds, query, userId, sessionId, messageId } = await req.json()

    // Initial query validation
    if (!query || query.trim() === "") {
      return new Response(
        JSON.stringify({ error: "Query cannot be empty" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Processing request:', { fileIds, query, messageId })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Update initial status
    await updateMessageStatus(supabase, messageId, 'processing', 'Initializing analysis...')

    // Handle case with no files
    if (!fileIds?.length) {
      console.log('No files provided, handling general query')
      const response = await handleGeneralQuery(query)
      await updateMessageWithResponse(supabase, messageId, response)
      return new Response(JSON.stringify({ message: 'Analysis complete' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Process files and collect analysis
    console.log('Processing files:', fileIds)
    const fileAnalysis = await processFiles(supabase, fileIds, messageId)
    
    // Get previous context from the last 5 messages
    const { data: previousMessages } = await supabase
      .from('chat_messages')
      .select('content, role')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(5)
    
    // Build system message with context
    const systemMessage = buildSystemMessage(fileAnalysis, previousMessages || [], query)
    console.log('Built system message for analysis')
    
    // Get AI analysis
    const analysis = await getAIAnalysis(systemMessage, query)
    console.log('Received AI analysis')
    
    // Update message with final response
    await updateMessageWithResponse(supabase, messageId, analysis)

    return new Response(
      JSON.stringify({ message: 'Analysis complete' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Processing error:', error)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    await handleError(supabase, error, req)
    return new Response(
      JSON.stringify({ error: 'Failed to process request', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

async function processFiles(supabase: any, fileIds: string[], messageId: string): Promise<FileAnalysis[]> {
  const results: FileAnalysis[] = []
  
  for (const fileId of fileIds) {
    await updateMessageStatus(supabase, messageId, 'processing', `Processing file ${fileId}...`)
    
    // Get file info and tags
    const { data: file, error: fileError } = await supabase
      .from('excel_files')
      .select(`
        *,
        message_files!inner(
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
      .single()

    if (fileError) throw new Error(`Failed to fetch file info: ${fileError.message}`)

    // Download and process file
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('excel_files')
      .download(file.file_path)

    if (downloadError) throw new Error(`Failed to download file: ${downloadError.message}`)

    const arrayBuffer = await fileData.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const jsonData = XLSX.utils.sheet_to_json(worksheet)

    // Extract tags
    const tags = file.message_files[0]?.message_file_tags.map((tag: any) => ({
      name: tag.file_tags.name,
      aiContext: tag.ai_context
    })) || []

    results.push({
      fileId,
      filename: file.filename,
      data: jsonData,
      metadata: {
        columns: Object.keys(jsonData[0] || {}),
        rowCount: jsonData.length,
        tags,
        role: file.message_files[0]?.role
      }
    })
  }

  return results
}

function buildSystemMessage(
  fileAnalysis: FileAnalysis[],
  previousMessages: Array<{ content: string; role: string }>,
  currentQuery: string
): string {
  // Build context from files
  const fileContexts = fileAnalysis.map(file => {
    const { filename, metadata, data } = file
    const sampleData = data.slice(0, 3)
    const tagContext = metadata.tags
      .map(tag => `${tag.name}${tag.aiContext ? `: ${tag.aiContext}` : ''}`)
      .join('\n')

    return `
File: ${filename}${metadata.role ? ` (${metadata.role})` : ''}
Columns: ${metadata.columns.join(', ')}
Row count: ${metadata.rowCount}
Tags:
${tagContext}
Sample data:
${JSON.stringify(sampleData, null, 2)}
    `.trim()
  }).join('\n\n')

  // Build conversation context
  const conversationContext = previousMessages
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n')

  // Enhanced system message with clear instruction format
  return `
You are an expert data analyst analyzing Excel files. You have access to the following data sources:

${fileContexts}

Previous conversation context:
${conversationContext}

Current user query: "${currentQuery}"

Instructions:
1. Analyze the provided data thoroughly
2. If comparing multiple files, highlight relationships and patterns
3. Provide specific insights from the data
4. If any relevant information is missing, explain what would be needed
5. Use concrete numbers and examples from the data
6. Format your response in a clear, structured way

Remember to focus on the specific data provided and the user's query.
  `.trim()
}

async function getAIAnalysis(systemMessage: string, query: string): Promise<string> {
  console.log('Sending request to OpenAI...')
  const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: query }
      ],
      temperature: 0.7,
    }),
  })

  if (!openAiResponse.ok) {
    const errorText = await openAiResponse.text()
    console.error('OpenAI API error:', errorText)
    throw new Error(`OpenAI API error: ${errorText}`)
  }

  const aiData = await openAiResponse.json()
  console.log('Received response from OpenAI')
  return aiData.choices[0].message.content
}

async function handleGeneralQuery(query: string): Promise<string> {
  console.log('Handling general query without files')
  const systemMessage = `
You are an expert data analyst. The user has not provided any Excel files for analysis, 
but has asked a general question. Provide helpful guidance or explanations about data analysis concepts.
Please be specific and practical in your response, using examples where appropriate.
  `.trim()

  const response = await getAIAnalysis(systemMessage, query)
  return response
}

async function updateMessageStatus(supabase: any, messageId: string, stage: string, details: string) {
  await supabase
    .from('chat_messages')
    .update({
      status: 'in_progress',
      metadata: {
        processing_stage: {
          stage,
          started_at: Date.now(),
          last_updated: Date.now(),
          details
        }
      }
    })
    .eq('id', messageId)
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
    .eq('id', messageId)
}

async function handleError(supabase: any, error: Error, req: Request) {
  try {
    const { messageId } = await req.json()
    if (messageId) {
      await supabase
        .from('chat_messages')
        .update({
          content: `I apologize, but I encountered an error while processing your request: ${error.message}`,
          status: 'failed',
          metadata: {
            processing_stage: {
              stage: 'failed',
              error: error.message,
              last_updated: Date.now()
            }
          }
        })
        .eq('id', messageId)
    }
  } catch (e) {
    console.error('Error handling error:', e)
  }
}
