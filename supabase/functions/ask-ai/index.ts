
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''

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
    const { workflowId, nodeId, executionId, aiProvider, userQuery, systemMessage, modelName } = 
      await req.json() as RequestBody

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
    
    // Basic implementation - would need to be expanded
    const aiResponse = "This is a placeholder response from the ask-ai function."

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
