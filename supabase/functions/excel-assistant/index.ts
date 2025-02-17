
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { corsHeaders } from "./cors.ts";
import { Database } from "./types.ts";
import { handleAnalyzeExcel } from "./excel.ts";
import { handleLargeLanguageModel } from "./assistant.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestId = crypto.randomUUID();
    const { fileId, query, userId, sessionId, threadId, messageId } = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient<Database>(supabaseUrl, supabaseKey);

    // Update message callback for streaming responses
    const updateMessageCallback = async (content: string, isComplete: boolean) => {
      const status = isComplete ? 'completed' : 'in_progress';
      const now = Date.now();
      
      const { error } = await supabase
        .from('chat_messages')
        .update({
          content,
          status,
          processing_stage: {
            stage: status,
            started_at: now,
            last_updated: now,
            completion_percentage: isComplete ? 100 : undefined
          }
        })
        .eq('id', messageId);

      if (error) {
        console.error('Error updating message:', error);
        throw error;
      }

      return new Response(
        JSON.stringify({ 
          message: content, 
          isComplete,
          status,
          processingStage: {
            stage: status,
            started_at: now,
            last_updated: now,
            completion_percentage: isComplete ? 100 : undefined
          }
        }),
        { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json" 
          } 
        }
      );
    };

    // Process the request
    if (fileId) {
      return await handleAnalyzeExcel(
        supabase,
        fileId,
        query,
        userId,
        sessionId,
        messageId,
        requestId,
        updateMessageCallback
      );
    } else {
      return await handleLargeLanguageModel(
        supabase,
        query,
        userId,
        sessionId,
        threadId,
        messageId,
        requestId,
        updateMessageCallback
      );
    }
  } catch (error) {
    console.error('Error in excel-assistant function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
