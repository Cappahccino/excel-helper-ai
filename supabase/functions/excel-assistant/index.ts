
// Import the Supabase client using a proper URL-style import path
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import OpenAI from 'https://cdn.jsdelivr.net/npm/openai@4.17.4/+esm';

// Import other local modules with proper relative paths
import type { ExcelAssistantRequest, ExcelAssistantResponse } from './types.ts';
import { processExcelData } from './excel.ts';
import { updateMessageStatus } from './database.ts';
import { ASSISTANT_INSTRUCTIONS, DEFAULT_AI_MODEL } from './config.ts';

// Fixing the issue with the incorrect import path for supabase

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY') || '',
});

// Create a Supabase client with the REST API URL and public API key
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  // This is a preflight request, respond appropriately
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message_id, session_id, content, file_ids, user_id } = await req.json() as ExcelAssistantRequest;

    console.log(`Processing request for message: ${message_id}, session: ${session_id}`);
    
    // Start generating a response
    let assistantResponse = '';
    let error: Error | null = null;

    // Update message status to analyzing
    await updateMessageStatus(supabase, message_id, 'analyzing', 'Processing Excel data');

    // Process any Excel files if provided
    const excelData = await processExcelData(supabase, file_ids);
    
    // Update message status to generating
    await updateMessageStatus(supabase, message_id, 'generating', 'Generating response');

    // Construct the messages array for the OpenAI API
    const messages = [
      {
        role: "system",
        content: ASSISTANT_INSTRUCTIONS
      },
      {
        role: "user",
        content: content || "Please analyze this Excel data"
      }
    ];

    if (excelData) {
      messages.push({
        role: "user",
        content: `Here is the Excel data:\n${JSON.stringify(excelData, null, 2)}`
      });
    }

    try {
      // Call the OpenAI API
      const stream = await openai.chat.completions.create({
        model: DEFAULT_AI_MODEL,
        messages: messages,
        temperature: 0,
        stream: true,
      });

      // Process the stream
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        assistantResponse += content;
        
        // Update the message with the current content
        await supabase
          .from('chat_messages')
          .update({ 
            content: assistantResponse,
            metadata: {
              processing_stage: {
                stage: 'generating',
                started_at: Date.now(),
                last_updated: Date.now(),
                completion_percentage: calculateCompletionPercentage(assistantResponse)
              }
            }
          })
          .eq('id', message_id);
      }

      // Mark message as completed
      await supabase
        .from('chat_messages')
        .update({ 
          content: assistantResponse,
          status: 'completed'
        })
        .eq('id', message_id);

      console.log(`Response generated for message: ${message_id}`);
      
      const response: ExcelAssistantResponse = {
        message_id,
        content: assistantResponse,
        status: 'completed'
      };

      return new Response(JSON.stringify(response), {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      });
      
    } catch (err) {
      error = err as Error;
      console.error('Error calling OpenAI:', error);
      
      // Mark message as failed
      await supabase
        .from('chat_messages')
        .update({ 
          status: 'failed',
          content: 'Failed to generate a response. Please try again.'
        })
        .eq('id', message_id);
        
      const errorResponse: ExcelAssistantResponse = {
        message_id,
        content: 'Failed to generate a response. Please try again.',
        status: 'failed',
        error: error.message
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
        status: 500
      });
    }
    
  } catch (err) {
    const error = err as Error;
    console.error('Request error:', error);
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      },
      status: 400
    });
  }
});

// Helper function to estimate completion percentage
function calculateCompletionPercentage(text: string): number {
  // This is a simple heuristic - it assumes an average response is around 1500 characters
  const estimatedTotalLength = 1500;
  const currentLength = text.length;
  const percentage = Math.min(Math.floor((currentLength / estimatedTotalLength) * 100), 99);
  return percentage;
}
