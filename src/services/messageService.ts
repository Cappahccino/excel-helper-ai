import { supabase } from "@/integrations/supabase/client";
import { DatabaseMessage, MessageFile, MessageImage } from "@/types/messages.types";
import { Message, MessageStatus } from "@/types/chat";
import { MESSAGES_PER_PAGE } from "@/config/constants";

export async function fetchMessages(sessionId: string, cursor: string | null = null) {
  let query = supabase
    .from('chat_messages')
    .select(`
      *,
      message_files(
        file_id,
        role
      ),
      message_generated_images(
        id,
        openai_file_id,
        file_type
      )
    `)
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
        role: 'user',
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
    return message;
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
        role: 'assistant',
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

function transformMessage(msg: DatabaseMessage): Message {
  let status: Message['status'] = 'processing'; // Default is processing
  if (msg.status === 'completed' || 
      msg.status === 'failed' || 
      msg.status === 'cancelled' || 
      msg.status === 'expired') {
    status = msg.status;
  }

  // Transform message_files to the correct format
  const messageFiles = msg.message_files?.map(mf => ({
    file_id: mf.file_id,
    role: mf.role,
    filename: undefined,
    file_size: undefined
  }));

  // Transform generated images if present
  const generatedImages = (msg as any).message_generated_images?.map(img => ({
    file_id: img.openai_file_id,
    file_type: img.file_type || 'image'
  })) || [];

  // Merge images from metadata with generated images
  const metadataImages = (msg.metadata as any)?.images || [];
  const allImages = [...metadataImages, ...generatedImages].filter((img, index, self) => 
    index === self.findIndex(t => t.file_id === img.file_id)
  );

  // Create the transformed metadata
  const metadataWithImages = {
    ...(msg.metadata as any || {}),
    images: allImages.length > 0 ? allImages : undefined
  };

  return {
    id: msg.id,
    content: msg.content,
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    session_id: msg.session_id,
    created_at: msg.created_at,
    updated_at: msg.updated_at,
    status,
    version: msg.version || undefined,
    deployment_id: msg.deployment_id || undefined,
    cleanup_after: msg.cleanup_after || undefined,
    cleanup_reason: msg.cleanup_reason || undefined,
    deleted_at: msg.deleted_at || undefined,
    is_ai_response: msg.is_ai_response || false,
    message_files: messageFiles,
    metadata: metadataWithImages
  };
}

function transformMessages(messages: DatabaseMessage[]): Message[] {
  return messages.map(transformMessage);
}
