
import { createClient } from '@supabase/supabase-js';
import { Database } from '../types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient<Database>(supabaseUrl, supabaseKey);

interface MessageMetadata {
  processing_stage?: {
    stage: string;
    started_at: number;
    last_updated: number;
    completion_percentage?: number;
  };
}

export async function validateMessageState(messageId: string) {
  const { data: message, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('id', messageId)
    .single();

  if (error) {
    console.error('Error validating message state:', error);
    throw new Error('Failed to validate message state');
  }

  return {
    isValid: message.role === 'assistant' && ['queued', 'in_progress'].includes(message.status),
    message,
  };
}

export async function updateMessageState(
  messageId: string, 
  threadMessageId: string, 
  runId: string
) {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      thread_message_id: threadMessageId,
      openai_run_id: runId,
      status: 'in_progress',
      processing_stage: {
        stage: 'generating',
        started_at: Date.now(),
        last_updated: Date.now()
      }
    })
    .eq('id', messageId);

  if (error) {
    console.error('Error updating message state:', error);
    throw new Error('Failed to update message state');
  }
}

export async function updateStreamingMessage(
  messageId: string,
  content: string,
  metadata?: MessageMetadata
) {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      content,
      metadata: metadata || {},
      status: content.trim().length > 0 ? 'in_progress' : 'queued'
    })
    .eq('id', messageId)
    .in('status', ['queued', 'in_progress']);

  if (error) {
    console.error('Error updating streaming message:', error);
    throw new Error('Failed to update streaming message');
  }
}

export async function completeMessage(messageId: string) {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      status: 'completed',
      processing_stage: {
        stage: 'completed',
        last_updated: Date.now(),
        completion_percentage: 100
      }
    })
    .eq('id', messageId);

  if (error) {
    console.error('Error completing message:', error);
    throw new Error('Failed to complete message');
  }
}

export async function failMessage(messageId: string, errorMessage: string) {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      status: 'failed',
      content: `Error: ${errorMessage}`,
      processing_stage: {
        stage: 'failed',
        last_updated: Date.now()
      }
    })
    .eq('id', messageId);

  if (error) {
    console.error('Error failing message:', error);
    throw new Error('Failed to update message failure state');
  }
}
