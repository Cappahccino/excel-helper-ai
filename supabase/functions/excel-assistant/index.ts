
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import * as XLSX from "https://esm.sh/xlsx@0.18.5"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { fileIds, query, userId, sessionId, messageId } = await req.json()
    
    if (!fileIds || fileIds.length === 0) {
      throw new Error('No file IDs provided')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Processing files:', fileIds)

    // Update message status to processing
    await supabase
      .from('chat_messages')
      .update({
        status: 'in_progress',
        metadata: {
          processing_stage: {
            stage: 'processing',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId)

    // Process each file
    const fileResults = await Promise.all(fileIds.map(async (fileId) => {
      console.log('Processing file:', fileId)
      
      // Get file info
      const { data: file, error: fileError } = await supabase
        .from('excel_files')
        .select('*')
        .eq('id', fileId)
        .single()

      if (fileError || !file) {
        console.error('File fetch error:', fileError)
        throw new Error(`Failed to fetch file info: ${fileError?.message}`)
      }

      // Download file
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('excel_files')
        .download(file.file_path)

      if (downloadError || !fileData) {
        console.error('File download error:', downloadError)
        throw new Error(`Failed to download file: ${downloadError?.message}`)
      }

      // Convert file to array buffer
      const arrayBuffer = await fileData.arrayBuffer()
      
      // Read workbook
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      
      // Process first worksheet
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet)
      
      return {
        fileId,
        filename: file.filename,
        data: jsonData,
        headers: Object.keys(jsonData[0] || {})
      }
    }))

    // Update message to analyzing state
    await supabase
      .from('chat_messages')
      .update({
        metadata: {
          processing_stage: {
            stage: 'analyzing',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId)

    // Prepare data summary for OpenAI
    const dataSummary = fileResults.map(result => {
      const { filename, data, headers } = result
      return `
File: ${filename}
Headers: ${headers.join(', ')}
Sample data (first 3 rows):
${JSON.stringify(data.slice(0, 3), null, 2)}
      `.trim()
    }).join('\n\n')

    // Prepare system message
    const systemMessage = `You are an expert data analyst. Analyze the provided Excel data and answer questions about it.
Current data context:
${dataSummary}

Provide clear, concise analysis based on the data. If you notice any interesting patterns or insights, mention them.
If the data doesn't contain enough information to answer a question, explain what's missing.`;

    console.log('Sending request to OpenAI...')
    
    // Send request to OpenAI
    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: query || "What insights can you provide about this data?" }
        ],
      }),
    })

    if (!openAiResponse.ok) {
      const error = await openAiResponse.text()
      console.error('OpenAI API error:', error)
      throw new Error(`OpenAI API error: ${error}`)
    }

    const aiData = await openAiResponse.json()
    const analysis = aiData.choices[0].message.content

    // Update message with analysis
    await supabase
      .from('chat_messages')
      .update({
        content: analysis,
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

    return new Response(
      JSON.stringify({ message: 'Processing complete' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Processing error:', error)

    // Update message with error
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const errorMessage = `I apologize, but I encountered an error while processing your request: ${error.message}`

    if (req.body) {
      const { messageId } = await req.json()
      if (messageId) {
        await supabase
          .from('chat_messages')
          .update({
            content: errorMessage,
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
    }

    return new Response(
      JSON.stringify({ 
        error: 'Failed to process request',
        details: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
