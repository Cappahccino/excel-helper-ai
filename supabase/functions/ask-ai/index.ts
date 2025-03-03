
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const openaiApiKey = Deno.env.get('OPENAI_API_KEY') || ''

const supabase = createClient(supabaseUrl, supabaseKey)

interface AskAIRequest {
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
      await req.json() as AskAIRequest

    // Validate inputs
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

    // Create a record for this request
    const { data: requestRecord, error: insertError } = await supabase
      .from('workflow_ai_requests')
      .insert({
        workflow_id: workflowId,
        node_id: nodeId,
        execution_id: executionId,
        ai_provider: aiProvider,
        user_query: userQuery,
        status: 'processing',
        system_message: systemMessage,
        model_name: modelName || 'gpt-4o-mini'
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error creating AI request record:', insertError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to create request record',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    const requestId = requestRecord.id

    // Simple mock implementation - in production you would call the actual AI provider
    const aiResponse = `This is a demo response to: "${userQuery}"\n\nIn a real implementation, this would call ${aiProvider} with the model ${modelName || 'default'}.`
    
    // Update the record with the response
    const { error: updateError } = await supabase
      .from('workflow_ai_requests')
      .update({
        ai_response: aiResponse,
        status: 'completed',
        completed_at: new Date().toISOString(),
        token_usage: { prompt_tokens: userQuery.length, completion_tokens: aiResponse.length, total_tokens: userQuery.length + aiResponse.length }
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('Error updating AI request record:', updateError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to update request record',
          requestId
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        aiResponse
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in ask-ai function:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
