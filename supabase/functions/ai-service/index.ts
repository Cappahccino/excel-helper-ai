// supabase/functions/ai-service/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Configuration, OpenAIApi } from 'https://esm.sh/openai@3.2.1'

// Initialize OpenAI
const configuration = new Configuration({
  apiKey: Deno.env.get('OPENAI_API_KEY'),
})
const openai = new OpenAIApi(configuration)

// Initialize Supabase client
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Handle preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const { operation, query, data, options, userId, sessionId, messageId } = await req.json()

    // Validate request
    if (!operation) {
      return new Response(
        JSON.stringify({ error: 'Operation is required' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    let result
    
    // Handle different AI operations
    switch (operation) {
      case 'analyze':
        result = await analyzeData(query, data, options)
        break
      
      case 'summarize':
        result = await summarizeData(query, data, options)
        break
      
      case 'extract':
        result = await extractData(query, data, options)
        break
      
      case 'classify':
        result = await classifyData(query, data, options)
        break
        
      case 'generate_formula':
        result = await generateFormula(query, data, options)
        break
        
      default:
        return new Response(
          JSON.stringify({ error: 'Unknown operation' }),
          { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
        )
    }
    
    // Log the operation if messageId provided
    if (messageId) {
      await logOperation(messageId, operation, result)
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    )
  }
})

// Implementation of AI operations
async function analyzeData(query, data, options) {
  // Format data for API consumption
  const dataPreview = data.slice(0, 10)
  const formattedData = JSON.stringify(dataPreview)
  
  // Build a prompt
  const prompt = query || `Analyze the following data and provide insights:\n\n${formattedData}\n\nPlease provide: 
  1. Key trends and patterns
  2. Statistical insights
  3. Anomalies or outliers
  4. Recommendations based on the data`

  // Call OpenAI API with a structured output format
  const response = await openai.createChatCompletion({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are an expert data analyst. Analyze the provided data and return insights in a structured format. Focus on identifying patterns, outliers, and actionable recommendations.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  })

  // Parse the response
  const content = response.data.choices[0].message.content
  let parsedContent
  
  try {
    parsedContent = JSON.parse(content)
  } catch (e) {
    // If not valid JSON, return as is
    parsedContent = { content }
  }

  return {
    content,
    insights: parsedContent.insights || parsedContent.keyInsights || [],
    statistics: parsedContent.statistics || {},
    recommendations: parsedContent.recommendations || [],
    visualizations: parsedContent.visualizations || [],
    processingTime: response.data.usage.total_tokens
  }
}

// Implement other AI operations similarly
async function summarizeData(query, data, options) {
  // Implementation similar to analyzeData but focused on summarization
}

async function extractData(query, data, options) {
  // Implementation for extraction
}

async function classifyData(query, data, options) {
  // Implementation for classification
}

async function generateFormula(query, data, options) {
  // Implementation for formula generation
}

// Log operation details to database
async function logOperation(messageId, operation, result) {
  try {
    await supabaseClient
      .from('ai_operation_logs')
      .insert({
        message_id: messageId,
        operation_type: operation,
        result_summary: JSON.stringify(result).slice(0, 1000), // Store a summary
        tokens_used: result.processingTime || 0
      })
  } catch (error) {
    console.error('Error logging operation:', error)
  }
}
