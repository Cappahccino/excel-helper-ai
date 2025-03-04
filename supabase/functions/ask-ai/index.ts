
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
    const { workflowId, nodeId, executionId, aiProvider, userQuery, systemMessage, modelName } = body

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
      
      const defaultModelName = 'gpt-4o-mini'
      
      try {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: modelName || defaultModelName,
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
      
      const defaultModelName = 'claude-3-haiku-20240307'
      
      try {
        const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: modelName || defaultModelName,
            system: systemMessage || 'You are a helpful assistant.',
            messages: [
              { role: 'user', content: userQuery }
            ],
            max_tokens: 1000
          })
        })
        
        if (!anthropicResponse.ok) {
          const errorData = await anthropicResponse.json()
          throw new Error(`Anthropic API error: ${JSON.stringify(errorData)}`)
        }
        
        const data = await anthropicResponse.json()
        aiResponse = data.content[0].text
      } catch (error) {
        console.error('Anthropic API error:', error)
        aiResponse = `Could not connect to Anthropic Claude. This is a placeholder response for: "${userQuery}"`
      }
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
      
      const defaultModelName = 'deepseek-chat'
      
      try {
        const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
          },
          body: JSON.stringify({
            model: modelName || defaultModelName,
            messages: [
              { role: 'system', content: systemMessage || 'You are a helpful assistant.' },
              { role: 'user', content: userQuery }
            ],
            temperature: 0.7,
            max_tokens: 1000
          })
        })
        
        if (!deepseekResponse.ok) {
          const errorData = await deepseekResponse.json()
          throw new Error(`Deepseek API error: ${JSON.stringify(errorData)}`)
        }
        
        const data = await deepseekResponse.json()
        aiResponse = data.choices[0].message.content
      } catch (error) {
        console.error('Deepseek API error:', error)
        aiResponse = `Could not connect to Deepseek. This is a placeholder response for: "${userQuery}"`
      }
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

    // Store the AI request in the database for tracking
    try {
      // Create Supabase client within the edge function
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      
      if (supabaseUrl && supabaseKey) {
        // Import is inside try block to handle potential failure gracefully
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Insert the request record
        await supabase.from('workflow_ai_requests').insert({
          id: requestId,
          workflow_id: workflowId,
          node_id: nodeId, 
          execution_id: executionId,
          ai_provider: aiProvider,
          user_query: userQuery,
          ai_response: aiResponse,
          status: 'completed',
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          model_name: modelName,
          system_message: systemMessage
        });
        
        console.log(`Stored AI request with ID: ${requestId}`);
      }
    } catch (dbError) {
      // Log error but don't fail the request
      console.error('Error storing AI request in database:', dbError);
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
