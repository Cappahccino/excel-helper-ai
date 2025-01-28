import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { Configuration, OpenAIApi } from 'https://esm.sh/openai@3.3.0'

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
    const { fileId, userPrompt } = await req.json()
    
    if (!fileId) {
      throw new Error('No file ID provided')
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

    // Get file metadata from database
    const { data: fileData, error: fileError } = await supabaseClient
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', user.data.user.id)
      .single()

    if (fileError) throw fileError

    // Download file from storage
    const { data: fileContent, error: downloadError } = await supabaseClient
      .storage
      .from('excel_files')
      .download(fileData.file_path)

    if (downloadError) throw downloadError

    // Convert file to text for analysis
    const text = await fileContent.text()

    // Initialize OpenAI
    const configuration = new Configuration({
      apiKey: Deno.env.get('OPENAI_API_KEY'),
    })
    const openai = new OpenAIApi(configuration)

    // Prepare prompt
    const prompt = userPrompt 
      ? `Analyze this Excel file content and answer the following question: ${userPrompt}\n\nFile content:\n${text}`
      : `Provide a summary of this Excel file content:\n${text}`

    // Get analysis from OpenAI
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    })

    const analysis = completion.data.choices[0].message?.content || 'No analysis generated'

    // Update last accessed timestamp
    await supabaseClient
      .from('excel_files')
      .update({ last_accessed: new Date().toISOString() })
      .eq('id', fileId)

    return new Response(
      JSON.stringify({ analysis }),
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