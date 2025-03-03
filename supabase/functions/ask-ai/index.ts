
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// Add xhr polyfill for fetch compatibility with some providers
import "https://deno.land/x/xhr@0.3.0/mod.ts";

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RequestBody = {
  workflowId: string;
  nodeId: string;
  executionId: string;
  aiProvider: 'openai' | 'anthropic' | 'deepseek';
  userQuery: string;
  modelName?: string;
  systemMessage?: string;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get required API keys
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');

    // Parse the request body
    const requestData: RequestBody = await req.json();
    const { workflowId, nodeId, executionId, aiProvider, userQuery, modelName, systemMessage } = requestData;

    if (!workflowId || !nodeId || !executionId || !aiProvider || !userQuery) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if the user has access to the workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, created_by')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      console.error('Workflow access error:', workflowError);
      return new Response(
        JSON.stringify({ error: 'Workflow not found or access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create AI request record
    const { data: aiRequest, error: insertError } = await supabase
      .from('workflow_ai_requests')
      .insert({
        workflow_id: workflowId,
        node_id: nodeId,
        execution_id: executionId,
        ai_provider: aiProvider,
        user_query: userQuery,
        status: 'processing',
        model_name: modelName || getDefaultModel(aiProvider)
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to create AI request record:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create AI request record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process AI query based on the provider
    let aiResponse = '';
    let tokenUsage = {};
    let error = null;

    try {
      if (aiProvider === 'openai') {
        if (!openaiApiKey) {
          throw new Error('OpenAI API key not configured');
        }
        const result = await callOpenAI(userQuery, systemMessage, modelName || 'gpt-4o-mini', openaiApiKey);
        aiResponse = result.text;
        tokenUsage = {
          prompt_tokens: result.usage?.prompt_tokens || 0,
          completion_tokens: result.usage?.completion_tokens || 0,
          total_tokens: result.usage?.total_tokens || 0
        };
      } else if (aiProvider === 'anthropic') {
        if (!anthropicApiKey) {
          throw new Error('Anthropic API key not configured');
        }
        const result = await callAnthropic(userQuery, systemMessage, modelName || 'claude-3-haiku-20240307', anthropicApiKey);
        aiResponse = result.text;
        tokenUsage = {
          input_tokens: result.usage?.input_tokens || 0,
          output_tokens: result.usage?.output_tokens || 0
        };
      } else if (aiProvider === 'deepseek') {
        if (!deepseekApiKey) {
          throw new Error('Deepseek API key not configured');
        }
        const result = await callDeepseek(userQuery, systemMessage, modelName || 'deepseek-chat', deepseekApiKey);
        aiResponse = result.text;
        tokenUsage = {
          prompt_tokens: result.usage?.prompt_tokens || 0,
          completion_tokens: result.usage?.completion_tokens || 0,
          total_tokens: result.usage?.total_tokens || 0
        };
      } else {
        throw new Error('Invalid AI provider selected');
      }

      // Update AI request record with the response
      await supabase
        .from('workflow_ai_requests')
        .update({
          ai_response: aiResponse,
          status: 'completed',
          completed_at: new Date().toISOString(),
          token_usage: tokenUsage
        })
        .eq('id', aiRequest.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          aiResponse, 
          requestId: aiRequest.id,
          tokenUsage
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      console.error('AI processing error:', e);
      error = e.message || 'Unknown error occurred';
      
      // Update AI request record with error
      await supabase
        .from('workflow_ai_requests')
        .update({
          status: 'failed',
          error_message: error,
          completed_at: new Date().toISOString()
        })
        .eq('id', aiRequest.id);

      return new Response(
        JSON.stringify({ error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (e) {
    console.error('Unexpected error:', e);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Function to call OpenAI
async function callOpenAI(userQuery: string, systemMessage?: string, modelName = 'gpt-4o-mini', apiKey: string) {
  const messages = [];
  
  if (systemMessage) {
    messages.push({ role: 'system', content: systemMessage });
  }
  
  messages.push({ role: 'user', content: userQuery });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    return {
      text: data.choices[0]?.message?.content || '',
      usage: data.usage
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
}

// Function to call Anthropic
async function callAnthropic(userQuery: string, systemMessage?: string, modelName = 'claude-3-haiku-20240307', apiKey: string) {
  const messages = [];
  
  messages.push({ role: 'user', content: userQuery });

  try {
    const body: any = {
      model: modelName,
      messages,
      temperature: 0.7,
      max_tokens: 4000,
    };

    if (systemMessage) {
      body.system = systemMessage;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Anthropic API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    return {
      text: data.content[0]?.text || '',
      usage: data.usage
    };
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw error;
  }
}

// Function to call Deepseek
async function callDeepseek(userQuery: string, systemMessage?: string, modelName = 'deepseek-chat', apiKey: string) {
  const messages = [];
  
  if (systemMessage) {
    messages.push({ role: 'system', content: systemMessage });
  }
  
  messages.push({ role: 'user', content: userQuery });

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Deepseek API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    return {
      text: data.choices[0]?.message?.content || '',
      usage: data.usage
    };
  } catch (error) {
    console.error('Deepseek API error:', error);
    throw error;
  }
}

// Helper function to get default model based on provider
function getDefaultModel(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-haiku-20240307';
    case 'deepseek':
      return 'deepseek-chat';
    default:
      return '';
  }
}
