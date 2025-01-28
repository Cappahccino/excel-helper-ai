import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const userId = formData.get('userId')

    if (!file || !userId) {
      throw new Error('File and user ID are required')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Sanitize filename
    const fileName = (file as File).name.replace(/[^\x00-\x7F]/g, '')
    const fileExt = fileName.split('.').pop()
    const filePath = `${crypto.randomUUID()}.${fileExt}`

    // Upload file to storage
    const { error: uploadError } = await supabase.storage
      .from('excel_files')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      throw new Error('Failed to upload file')
    }

    // Save file metadata to database
    const { data: fileData, error: dbError } = await supabase
      .from('excel_files')
      .insert({
        user_id: userId,
        filename: fileName,
        file_path: filePath,
        file_size: file.size,
      })
      .select()
      .single()

    if (dbError) {
      throw new Error('Failed to save file metadata')
    }

    return new Response(
      JSON.stringify({ 
        message: 'File uploaded successfully',
        fileId: fileData.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in upload-excel function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})