import { supabase } from "@/integrations/supabase/client";
import { DatabaseMessage } from "@/types/messages.types";
import { Message, MessagePin } from "@/types/chat";
import { MESSAGES_PER_PAGE } from "@/config/constants";

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

    // Apply cursor pagination
    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    // Apply filters
    if (filter === 'pinned') {
      const { data: pinnedMessageIds } = await supabase
        .from('message_pins')
        .select('message_id')
        .eq('session_id', sessionId);

      if (pinnedMessageIds && pinnedMessageIds.length > 0) {
        query = query.in('id', pinnedMessageIds.map(pin => pin.message_id));
      } else {
        // No pins, return empty array
        return [];
      }
    }

    // Apply search term
    if (searchTerm) {
      if (includeFileContent) {
        // Search in message content OR file content
        query = query.or(`content.ilike.%${searchTerm}%, message_files.file_id.in.(select file_id from excel_files where filename.ilike.%${searchTerm}%)`);
      } else {
        // Search only in message content
        query = query.ilike('content', `%${searchTerm}%`);
      }
    }

    const { data: rawMessages, error } = await query;

    if (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }

    // Ensure we're handling data correctly to avoid type errors
    if (!rawMessages) {
      return [];
    }

    // Make sure all messages are complete with expected fields before transforming
    const validMessages = rawMessages.filter(msg => 
      msg && typeof msg === 'object' && msg !== null && 'id' in msg && 'content' in msg
    ) as DatabaseMessage[];

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
  fileIds?: string[] | null
) {
  try {
    console.log('Creating user message with files:', fileIds);

    // Create the message
    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        content,
        role: 'user', // Ensure role is strictly 'user' to match Message type
        session_id: sessionId,
        is_ai_response: false,
        user_id: userId,
        status: 'completed' as const,
        version: '1.0.0',
        migration_verified: true
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error creating message:', messageError);
      throw messageError;
    }

    // If there are files, create the message_files entries with batch processing
    if (fileIds && fileIds.length > 0) {
      const batchSize = 10;
      for (let i = 0; i < fileIds.length; i += batchSize) {
        const batch = fileIds.slice(i, i + batchSize);
        const messageFiles = batch.map(fileId => ({
          message_id: message.id,
          file_id: fileId,
          role: 'user'
        }));

        const { error: filesError } = await supabase
          .from('message_files')
          .insert(messageFiles);

        if (filesError) {
          console.error(`Error creating message files batch ${i}:`, filesError);
          // Continue with other batches even if one fails
        }
      }
    }

    console.log('Successfully created user message with files:', message.id);
    return transformMessage(message as DatabaseMessage);
  } catch (error) {
    console.error('Error in createUserMessage:', error);
    throw error;
  }
}

export async function createAssistantMessage(
  sessionId: string,
  userId: string,
  fileIds?: string[] | null
) {
  try {
    console.log('Creating assistant message with files:', fileIds);

    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        content: '',
        role: 'assistant', // Ensure role is strictly 'assistant' to match Message type
        session_id: sessionId,
        is_ai_response: true,
        user_id: userId,
        status: 'processing' as const,
        version: '1.0.0',
        migration_verified: true,
        deployment_id: crypto.randomUUID(),
        metadata: {
          processing_stage: {
            stage: 'generating',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error creating assistant message:', messageError);
      throw messageError;
    }

    // If there are files, create the message_files entries with batch processing
    if (fileIds && fileIds.length > 0) {
      const batchSize = 10;
      for (let i = 0; i < fileIds.length; i += batchSize) {
        const batch = fileIds.slice(i, i + batchSize);
        const messageFiles = batch.map(fileId => ({
          message_id: message.id,
          file_id: fileId,
          role: 'assistant'
        }));

        const { error: filesError } = await supabase
          .from('message_files')
          .insert(messageFiles);

        if (filesError) {
          console.error(`Error creating message files batch ${i} for assistant:`, filesError);
          // Continue with other batches even if one fails
        }
      }
    }

    console.log('Successfully created assistant message:', message.id);
    return transformMessage(message as DatabaseMessage);
  } catch (error) {
    console.error('Error in createAssistantMessage:', error);
    throw error;
  }
}

/**
 * Delete a message and related data (files, reactions, etc.)
 */
export async function deleteMessage(messageId: string, sessionId: string): Promise<boolean> {
  try {
    // First, delete any pins associated with this message
    const { error: pinError } = await supabase
      .from('message_pins')
      .delete()
      .eq('message_id', messageId)
      .eq('session_id', sessionId);

    if (pinError) {
      console.error('Error deleting message pins:', pinError);
      // Continue with message deletion anyway
    }

    // Next, delete any reactions to this message
    const { error: reactionError } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId);

    if (reactionError) {
      console.error('Error deleting message reactions:', reactionError);
      // Continue with message deletion anyway
    }

    // Delete message-file associations
    // Note: We're not deleting the actual files, just the association
    const { error: fileAssocError } = await supabase
      .from('message_files')
      .delete()
      .eq('message_id', messageId);

    if (fileAssocError) {
      console.error('Error deleting message file associations:', fileAssocError);
      // Continue with message deletion anyway
    }

    // Finally, delete the message itself
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
    // First, check if message exists and is a user message
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

    // Update the message
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
    // Check if pin already exists
    const { data: existingPin } = await supabase
      .from('message_pins')
      .select('*')
      .eq('message_id', messageId)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (existingPin) {
      return existingPin as MessagePin;
    }

    // Create new pin
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
  // Ensure role is strictly 'user' or 'assistant' as required by the Message type
  const role = message.role === 'assistant' ? 'assistant' : 'user';
  
  return {
    ...message,
    role: role,
    // Add any additional transformations here
  } as Message;
}
