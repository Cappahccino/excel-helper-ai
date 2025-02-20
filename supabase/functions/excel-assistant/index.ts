
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

      // Update file status
      await supabase
        .from('excel_files')
        .update({ processing_status: 'processing' })
        .eq('id', fileId)

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
      
      // Get column definitions
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
      const columns = []
      for (let C = range.s.c; C <= range.e.c; ++C) {
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })]
          if (cell) {
            columns.push({
              name: cell.v.toString(),
              type: typeof cell.v
            })
            break
          }
        }
      }

      // Create summary statistics
      const summary = {
        rowCount: jsonData.length,
        columnCount: columns.length,
        sampleData: jsonData.slice(0, 5)
      }

      // Store metadata
      const { error: metadataError } = await supabase
        .from('file_metadata')
        .insert({
          file_id: fileId,
          column_definitions: columns,
          row_count: jsonData.length,
          data_summary: summary
        })

      if (metadataError) {
        console.error('Metadata storage error:', metadataError)
        throw new Error(`Failed to store file metadata: ${metadataError.message}`)
      }

      // Update file status to completed
      await supabase
        .from('excel_files')
        .update({ 
          processing_status: 'completed',
          processing_completed_at: new Date().toISOString()
        })
        .eq('id', fileId)

      return {
        fileId,
        filename: file.filename,
        summary
      }
    }))

    // Generate response message
    const fileAnalysis = fileResults.map(result => {
      const { filename, summary } = result
      return `
File: ${filename}
- Contains ${summary.rowCount} rows and ${summary.columnCount} columns
- Column names: ${summary.sampleData[0] ? Object.keys(summary.sampleData[0]).join(', ') : 'No data'}
- First ${Math.min(5, summary.rowCount)} rows preview available in metadata
      `.trim()
    }).join('\n\n')

    const response = `I've analyzed the Excel ${fileResults.length > 1 ? 'files' : 'file'} you provided:\n\n${fileAnalysis}\n\nWhat would you like to know about the data?`

    // Update message with analysis
    await supabase
      .from('chat_messages')
      .update({
        content: response,
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

    const errorMessage = `I apologize, but I encountered an error while processing the Excel file: ${error.message}`

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
        error: 'Failed to process Excel file',
        details: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
