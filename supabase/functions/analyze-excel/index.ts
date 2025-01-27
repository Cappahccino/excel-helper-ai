import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Configuration, OpenAIApi } from 'https://esm.sh/openai@3.2.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { fileContent, userPrompt } = await req.json()

    // Initialize OpenAI
    const configuration = new Configuration({
      apiKey: Deno.env.get('OPENAI_API_KEY'),
    })
    const openai = new OpenAIApi(configuration)

    // Prepare the messages for OpenAI
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that analyzes Excel files.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          instruction: "I have attached a excel file, can you summarise the contents of the file for me please.",
          fileContent: fileContent,
          userPrompt: userPrompt
        })
      }
    ]

    // Call OpenAI API
    const completion = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: messages,
    })

    return new Response(
      JSON.stringify({ analysis: completion.data.choices[0].message?.content }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})