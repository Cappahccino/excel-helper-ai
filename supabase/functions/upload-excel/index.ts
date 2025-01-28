import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

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
    // Get the form data from the request
    const formData = await req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      throw new Error('No file provided')
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the current user
    const authHeader = req.headers.get('Authorization')!
    const user = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))
    
    if (!user.data.user) {
      throw new Error('Not authenticated')
    }

    // Upload file to storage
    const fileBuffer = await file.arrayBuffer()
    const fileName = `${user.data.user.id}/${Date.now()}-${file.name}`
    
    const { data: uploadData, error: uploadError } = await supabaseClient
      .storage
      .from('excel_files')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: true
      })

    if (uploadError) throw uploadError

    // Save file metadata to database
    const { data: metaData, error: metaError } = await supabaseClient
      .from('excel_files')
      .insert({
        user_id: user.data.user.id,
        filename: file.name,
        file_path: uploadData.path,
        file_size: file.size
      })
      .select()
      .single()

    if (metaError) throw metaError

    return new Response(
      JSON.stringify({ fileId: metaData.id }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})