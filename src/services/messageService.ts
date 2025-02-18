
import { supabase } from "@/integrations/supabase/client";
import { DatabaseMessage } from "@/types/messages.types";
import { Message } from "@/types/chat";
import { MESSAGES_PER_PAGE } from "@/config/constants";

export async function fetchMessages(sessionId: string, cursor: string | null = null) {
  let query = supabase
    .from('chat_messages')
    .select('*, excel_files(filename, file_size)')
    .eq('session_id', sessionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(MESSAGES_PER_PAGE);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }
  
  const { data: rawMessages, error } = await query;
  
  if (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }

  return transformMessages(rawMessages as DatabaseMessage[]);
}

export async function createUserMessage(content: string, sessionId: string, userId: string, fileId?: string | null) {
  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      content,
      role: 'user',
      session_id: sessionId,
      excel_file_id: fileId,
      is_ai_response: false,
      user_id: userId,
      status: 'completed' as const,
      version: '1.0.0'
    })
    .select('*, excel_files(filename, file_size)')
    .single();

  if (error) throw error;
  return transformMessage(message as DatabaseMessage);
}

export async function createAssistantMessage(sessionId: string, userId: string, fileId?: string | null) {
  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      content: '',
      role: 'assistant',
      session_id: sessionId,
      excel_file_id: fileId,
      is_ai_response: true,
      user_id: userId,
      status: 'in_progress' as const,
      version: '1.0.0',
      deployment_id: crypto.randomUUID(),
      metadata: {
        processing_stage: {
          stage: 'generating',
          started_at: Date.now(),
          last_updated: Date.now()
        }
      }
    })
    .select('*, excel_files(filename, file_size)')
    .single();

  if (error) throw error;
  return transformMessage(message as DatabaseMessage);
}

function transformMessage(msg: DatabaseMessage): Message {
  let status: Message['status'] = 'in_progress';
  if (msg.status === 'completed' || 
      msg.status === 'failed' || 
      msg.status === 'cancelled' || 
      msg.status === 'expired') {
    status = msg.status;
  }

  return {
    id: msg.id,
    content: msg.content,
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    session_id: msg.session_id,
    created_at: msg.created_at,
    updated_at: msg.updated_at,
    excel_file_id: msg.excel_file_id,
    status,
    version: msg.version || undefined,
    deployment_id: msg.deployment_id || undefined,
    cleanup_after: msg.cleanup_after || undefined,
    cleanup_reason: msg.cleanup_reason || undefined,
    deleted_at: msg.deleted_at || undefined,
    is_ai_response: msg.is_ai_response || false,
    excel_files: msg.excel_files,
    metadata: msg.metadata as Message['metadata']
  };
}

function transformMessages(messages: DatabaseMessage[]): Message[] {
  return messages.map(transformMessage);
}
