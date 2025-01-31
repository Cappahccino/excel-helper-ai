import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

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
    const { fileId, query } = await req.json()

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get file from storage
    const { data: fileData } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single()

    if (!fileData) {
      throw new Error('File not found')
    }

    // Download file from storage
    const { data: fileBuffer, error: downloadError } = await supabase
      .storage
      .from('excel_files')
      .download(fileData.file_path)

    if (downloadError) {
      throw new Error('Error downloading file')
    }

    // Convert file to array buffer
    const arrayBuffer = await fileBuffer.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer)
    
    // Convert Excel data to JSON
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet)

    // Prepare data summary
    const sheetNames = workbook.SheetNames
    const columnNames = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0]
    const rowCount = jsonData.length

    // Prepare system message
    const systemMessage = `You are an AI assistant specialized in analyzing Excel files. 
    The file has ${sheetNames.length} sheet(s), with the first sheet containing ${rowCount} rows 
    and the following columns: ${columnNames.join(', ')}. 
    Provide clear, concise analysis and respond to queries about this data.`

    // Prepare messages array
    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: query || 'Please provide a brief summary of this Excel file and its contents.' }
    ]

    // Call OpenAI API
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
      }),
    })

    if (!openAIResponse.ok) {
      throw new Error('OpenAI API error')
    }

    const aiData = await openAIResponse.json()
    const analysis = aiData.choices[0].message.content

    // Store the analysis in chat_messages
    const { error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        user_id: fileData.user_id,
        excel_file_id: fileId,
        content: analysis,
        is_ai_response: true
      })

    if (insertError) {
      throw new Error('Error storing analysis')
    }

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})