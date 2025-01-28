import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { fileId, userPrompt } = await req.json()

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
      throw new Error('Failed to download file')
    }

    // Read Excel file
    const arrayBuffer = await fileBuffer.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer)
    
    // Extract basic information
    const sheetNames = workbook.SheetNames
    const firstSheet = workbook.Sheets[sheetNames[0]]
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })
    
    // Prepare data summary
    const columns = data[0]
    const rowCount = data.length - 1
    const summary = {
      fileName: fileData.filename,
      sheets: sheetNames,
      columns,
      rowCount,
      sampleData: data.slice(1, 6) // First 5 rows as sample
    }

    // Prepare prompt for OpenAI
    const basePrompt = `Analyze this Excel file:
    Filename: ${summary.fileName}
    Number of rows: ${summary.rowCount}
    Columns: ${columns.join(', ')}
    Sample data (first 5 rows): ${JSON.stringify(summary.sampleData)}
    `

    const finalPrompt = userPrompt 
      ? `${basePrompt}\nUser query: ${userPrompt}\nProvide insights based on the query.`
      : `${basePrompt}\nProvide a general summary and key insights from this data.`

    // Call OpenAI API
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a data analyst expert at analyzing Excel files.' },
          { role: 'user', content: finalPrompt }
        ],
      }),
    })

    const aiResult = await openAIResponse.json()
    const analysis = aiResult.choices[0].message.content

    // Update last accessed time
    await supabase
      .from('excel_files')
      .update({ last_accessed: new Date().toISOString() })
      .eq('id', fileId)

    return new Response(
      JSON.stringify({ 
        summary,
        analysis,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in analyze-excel function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})