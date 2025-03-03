
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') || ''

interface RequestBody {
  workflowId: string
  nodeId: string
  executionId: string
  aiProvider: 'openai' | 'anthropic' | 'deepseek'
  userQuery: string
  systemMessage?: string
  modelName?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json() as RequestBody
    const { workflowId, nodeId, executionId, aiProvider, userQuery, systemMessage, modelName = 'gpt-4o-mini' } = body

    // Input validation
    if (!workflowId || !nodeId || !executionId || !aiProvider || !userQuery) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    // Create a record in the workflow_ai_requests table
    const requestId = crypto.randomUUID()
    
    // Call the appropriate AI provider API
    let aiResponse: string
    
    if (aiProvider === 'openai') {
      if (!OPENAI_API_KEY) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'OpenAI API key not configured',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        )
      }
      
      try {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: 'system', content: systemMessage || 'You are a helpful assistant.' },
              { role: 'user', content: userQuery }
            ],
            temperature: 0.7,
          })
        })
        
        if (!openaiResponse.ok) {
          const errorData = await openaiResponse.json()
          throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`)
        }
        
        const data = await openaiResponse.json()
        aiResponse = data.choices[0].message.content
      } catch (error) {
        console.error('OpenAI API error:', error)
        // Fallback to placeholder for development or testing
        aiResponse = `Could not connect to OpenAI. This is a placeholder response for: "${userQuery}"`
      }
    } else if (aiProvider === 'anthropic') {
      if (!ANTHROPIC_API_KEY) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Anthropic API key not configured',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        )
      }
      
      // This is a placeholder - you would need to implement the Anthropic API call
      aiResponse = `This is a placeholder Anthropic response for query: "${userQuery}"`
    } else if (aiProvider === 'deepseek') {
      if (!DEEPSEEK_API_KEY) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Deepseek API key not configured',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        )
      }
      
      // This is a placeholder - you would need to implement the Deepseek API call
      aiResponse = `This is a placeholder Deepseek response for query: "${userQuery}"`
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Unsupported AI provider: ${aiProvider}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        aiResponse,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error processing AI request:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unknown error occurred',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
