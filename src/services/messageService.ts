import { supabase } from "@/integrations/supabase/client";
import { DatabaseMessage } from "@/types/messages.types";
import { Message, MessagePin, MessageStatus } from "@/types/chat";
import { MESSAGES_PER_PAGE } from "@/config/constants";
import { v4 as uuidv4 } from 'uuid';

export async function fetchMessages(
  sessionId: string,
  cursor: string | null = null,
  options?: {
    pageSize?: number;
    filter?: string;
    searchTerm?: string;
    includeFileContent?: boolean;
    selectFields?: string[];
  }
) {
  const {
    pageSize = MESSAGES_PER_PAGE,
    filter = 'all',
    searchTerm = '',
    includeFileContent = false,
    selectFields = ['*', 'message_files(*)']
  } = options || {};

  try {
    let query = supabase
      .from('chat_messages')
      .select(selectFields.join(','))
      .eq('session_id', sessionId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(pageSize);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    if (filter === 'pinned') {
      const { data: pinnedMessageIds } = await supabase
        .from('message_pins')
        .select('message_id')
        .eq('session_id', sessionId);

      if (pinnedMessageIds && pinnedMessageIds.length > 0) {
        query = query.in('id', pinnedMessageIds.map(pin => pin.message_id));
      } else {
        return [];
      }
    }

    if (searchTerm) {
      if (includeFileContent) {
        query = query.or(`content.ilike.%${searchTerm}%, message_files.file_id.in.(select file_id from excel_files where filename.ilike.%${searchTerm}%)`);
      } else {
        query = query.ilike('content', `%${searchTerm}%`);
      }
    }

    const { data: rawMessages, error } = await query;

    if (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }

    if (!rawMessages) {
      return [];
    }

    const validMessages = (rawMessages as any[]).filter((msg): msg is DatabaseMessage => {
      return msg !== null && 
             typeof msg === 'object' && 
             'id' in msg && 
             'content' in msg && 
             'role' in msg && 
             'session_id' in msg;
    });

    return transformMessages(validMessages);
  } catch (error) {
    console.error('Error in fetchMessages:', error);
    throw error;
  }
}

export async function createUserMessage(
  content: string,
  sessionId: string,
  userId: string,
  fileIds: string[] = []
) {
  console.log('Creating user message:', { content, sessionId, userId, fileIds });
  
  const messageId = uuidv4();
  const message = {
    id: messageId,
    content,
    role: 'user',
    session_id: sessionId,
    user_id: userId,
    status: 'processing' as MessageStatus,
    metadata: {
      file_ids: fileIds,
      processing_stage: {
        stage: 'processing',
        started_at: Date.now()
      }
    }
  };

  try {
    const { error: insertError } = await supabase
      .from('chat_messages')
      .insert(message);

    if (insertError) {
      console.error('Error inserting user message:', insertError);
      throw insertError;
    }

    console.log('Calling edge function to queue message:', messageId);
    const { data: functionData, error: functionError } = await supabase.functions.invoke('queue-message', {
      body: {
        messageId,
        query: content,
        userId,
        sessionId,
        fileIds,
        isTextOnly: !fileIds?.length
      }
    });

    if (functionError) {
      throw new Error(`Failed to queue message: ${functionError.message}`);
    }

    console.log('Message queued successfully:', messageId);
    return message;
  } catch (error) {
    console.error('Error in createUserMessage:', error);
    throw error;
  }
}

export async function createAssistantMessage(
  sessionId: string,
  userId: string,
  fileIds: string[] = []
) {
  console.log('Creating assistant message:', { sessionId, userId, fileIds });
  
  const messageId = uuidv4();
  const message = {
    id: messageId,
    content: '',
    role: 'assistant',
    session_id: sessionId,
    user_id: userId,
    status: 'processing' as MessageStatus,
    metadata: {
      file_ids: fileIds,
      processing_stage: {
        stage: 'generating',
        started_at: Date.now(),
        last_updated: Date.now()
      }
    }
  };

  const { error } = await supabase
    .from('chat_messages')
    .insert(message);

  if (error) {
    console.error('Error creating assistant message:', error);
    throw error;
  }

  return message;
}

/**
 * Delete a message and related data (files, reactions, etc.)
 */
export async function deleteMessage(messageId: string, sessionId: string): Promise<boolean> {
  try {
    const { error: pinError } = await supabase
      .from('message_pins')
      .delete()
      .eq('message_id', messageId)
      .eq('session_id', sessionId);

    if (pinError) {
      console.error('Error deleting message pins:', pinError);
      // Continue with message deletion anyway
    }

    const { error: reactionError } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId);

    if (reactionError) {
      console.error('Error deleting message reactions:', reactionError);
      // Continue with message deletion anyway
    }

    const { error: fileAssocError } = await supabase
      .from('message_files')
      .delete()
      .eq('message_id', messageId);

    if (fileAssocError) {
      console.error('Error deleting message file associations:', fileAssocError);
      // Continue with message deletion anyway
    }

    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('id', messageId)
      .eq('session_id', sessionId);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
}

/**
 * Edit a message's content
 * Only user messages can be edited, not assistant messages
 */
export async function editMessage(
  messageId: string,
  content: string,
  sessionId: string
): Promise<Message> {
  try {
    const { data: existingMessage, error: checkError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('id', messageId)
      .eq('session_id', sessionId)
      .eq('role', 'user')
      .single();

    if (checkError) {
      console.error('Error checking message:', checkError);
      throw new Error('Message not found or cannot be edited');
    }

    const { data: updatedMessage, error: updateError } = await supabase
      .from('chat_messages')
      .update({ 
        content, 
        updated_at: new Date().toISOString(),
        is_edited: true
      })
      .eq('id', messageId)
      .eq('session_id', sessionId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating message:', updateError);
      throw updateError;
    }

    return transformMessage(updatedMessage as DatabaseMessage);
  } catch (error) {
    console.error('Error in editMessage:', error);
    throw error;
  }
}

/**
 * Pin a message for quick reference
 */
export async function pinMessage(
  messageId: string,
  sessionId: string
): Promise<MessagePin> {
  try {
    const { data: existingPin } = await supabase
      .from('message_pins')
      .select('*')
      .eq('message_id', messageId)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (existingPin) {
      return existingPin as MessagePin;
    }

    const { data: pin, error } = await supabase
      .from('message_pins')
      .insert({
        message_id: messageId,
        session_id: sessionId
      })
      .select()
      .single();

    if (error) {
      console.error('Error pinning message:', error);
      throw error;
    }

    return pin as MessagePin;
  } catch (error) {
    console.error('Error in pinMessage:', error);
    throw error;
  }
}

/**
 * Unpin a message
 */
export async function unpinMessage(
  messageId: string,
  sessionId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('message_pins')
      .delete()
      .eq('message_id', messageId)
      .eq('session_id', sessionId);

    if (error) {
      console.error('Error unpinning message:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error in unpinMessage:', error);
    throw error;
  }
}

// Helper function to transform database messages to client format
function transformMessages(messages: DatabaseMessage[]): Message[] {
  return messages.map(transformMessage);
}

// Transform a single message
function transformMessage(message: DatabaseMessage): Message {
  const role = message.role === 'assistant' ? 'assistant' : 'user';
  
  return {
    ...message,
    role: role,
    // Add any additional transformations here
  } as Message;
}

export async function updateMessageContent(messageId: string, content: string, status: MessageStatus = 'completed') {
  console.log('Updating message content:', { messageId, status });
  
  try {
    const { error } = await supabase
      .from('chat_messages')
      .update({
        content,
        status,
        updated_at: new Date().toISOString(),
        metadata: {
          processing_stage: {
            stage: status,
            completed_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .eq('id', messageId);

    if (error) {
      console.error('Error updating message content:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in updateMessageContent:', error);
    throw error;
  }
}
