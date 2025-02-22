
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface TagRequest {
  messageId: string
  fileIds: string[]
  tagNames: string[]
  userId: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { messageId, fileIds, tagNames, userId } = await req.json() as TagRequest

    // Start transaction
    const { data: existingMessage, error: messageError } = await supabaseClient
      .from('chat_messages')
      .select('id, user_id')
      .eq('id', messageId)
      .single()

    if (messageError || !existingMessage) {
      return new Response(
        JSON.stringify({ error: 'Message not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (existingMessage.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized access to message' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify file ownership
    const { data: files, error: filesError } = await supabaseClient
      .from('excel_files')
      .select('id, user_id')
      .in('id', fileIds)
      .eq('user_id', userId)

    if (filesError) {
      return new Response(
        JSON.stringify({ error: 'Error verifying file ownership' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (files.length !== fileIds.length) {
      return new Response(
        JSON.stringify({ error: 'One or more files not found or unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = []
    const errors = []

    // Process tags in transaction
    for (const tagName of tagNames) {
      try {
        const { data: tag, error: tagError } = await supabaseClient
          .rpc('create_tag_with_validation', {
            p_name: tagName.toLowerCase().trim(),
            p_category: null,
            p_type: 'custom',
            p_is_system: false
          })

        if (tagError) throw tagError

        // Create tag associations for each file
        for (const fileId of fileIds) {
          const { data: assoc, error: assocError } = await supabaseClient
            .rpc('assign_tag_to_file', {
              p_message_id: messageId,
              p_file_id: fileId,
              p_tag_id: tag.id,
              p_ai_context: null
            })

          if (assocError) {
            errors.push(`Failed to assign tag ${tagName} to file ${fileId}: ${assocError.message}`)
            continue
          }

          results.push({ tagName, fileId, success: true })
        }
      } catch (error) {
        console.error(`Error processing tag ${tagName}:`, error)
        errors.push(`Failed to process tag ${tagName}: ${error.message}`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: errors.length === 0,
        results,
        errors: errors.length > 0 ? errors : null
      }),
      { 
        status: errors.length === 0 ? 200 : 207,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
