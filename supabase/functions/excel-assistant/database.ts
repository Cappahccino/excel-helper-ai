
import { createClient } from '@supabase/supabase-js';
import { Message, MessageStatus } from './types';
import { corsHeaders } from './cors';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function validateMessageState(messageId: string): Promise<{
  isValid: boolean;
  isStuck: boolean;
  currentStatus: MessageStatus;
}> {
  console.log(`Validating message state for message ${messageId}`);
  
  const { data: message, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('id', messageId)
    .maybeSingle();

  if (error || !message) {
    console.error('Error fetching message:', error);
    return { isValid: false, isStuck: false, currentStatus: 'failed' };
  }

  const isStuck = message.created_at && 
    (new Date().getTime() - new Date(message.created_at).getTime() > 5 * 60 * 1000);

  return {
    isValid: message.role === 'assistant' && message.status === 'in_progress',
    isStuck,
    currentStatus: message.status as MessageStatus
  };
}

export async function updateMessageStatus(
  messageId: string, 
  status: MessageStatus, 
  content?: string,
  metadata?: Record<string, any>
): Promise<void> {
  console.log(`Updating message ${messageId} status to ${status}`);
  
  const update: Record<string, any> = {
    status,
    updated_at: new Date().toISOString()
  };

  if (content !== undefined) {
    update.content = content;
  }

  if (metadata) {
    update.metadata = metadata;
  }

  const { error } = await supabase
    .from('chat_messages')
    .update(update)
    .eq('id', messageId);

  if (error) {
    console.error('Error updating message status:', error);
    throw error;
  }
}

export async function createInitialMessage(
  content: string,
  role: 'user' | 'assistant',
  sessionId: string,
  userId: string,
  fileId?: string | null
): Promise<{ id: string }> {
  console.log(`Creating initial ${role} message for session ${sessionId}`);

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      content,
      role,
      session_id: sessionId,
      excel_file_id: fileId,
      is_ai_response: role === 'assistant',
      user_id: userId,
      status: role === 'user' ? 'completed' : 'in_progress',
      version: '1.0.0',
      metadata: role === 'assistant' ? {
        processing_stage: {
          stage: 'generating',
          started_at: Date.now(),
          last_updated: Date.now()
        }
      } : null
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating message:', error);
    throw error;
  }

  return { id: data.id };
}

export async function getMessageContent(messageId: string): Promise<string | null> {
  console.log(`Fetching content for message ${messageId}`);
  
  const { data, error } = await supabase
    .from('chat_messages')
    .select('content')
    .eq('id', messageId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching message content:', error);
    throw error;
  }

  return data?.content ?? null;
}

