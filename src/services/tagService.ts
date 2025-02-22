import { supabase } from "@/integrations/supabase/client";
import { Tag, MessageFileTag, TagMetadata, TagUsageStats } from "@/types/tags";

/**
 * Fetches all available tags with their usage statistics
 */
export async function fetchTags() {
  const { data: tags, error } = await supabase
    .from('file_tags')
    .select(`
      id,
      name,
      type,
      category,
      created_at,
      is_system,
      metadata
    `)
    .order('name');

  if (error) {
    console.error('Error fetching tags:', error);
    throw new Error(`Failed to fetch tags: ${error.message}`);
  }
  
  return (tags || []).map(tag => ({
    ...tag,
    metadata: tag.metadata ? {
      usage_stats: {
        total_uses: (tag.metadata as any)?.usage_stats?.total_uses ?? 0,
        last_used: (tag.metadata as any)?.usage_stats?.last_used ?? null,
        file_count: (tag.metadata as any)?.usage_stats?.file_count ?? 0
      }
    } : null
  } as Tag));
}

/**
 * Creates a new tag if it doesn't exist
 */
export async function createTag(name: string, category: string | null = null) {
  const { data: client } = await supabase.auth.getSession();
  if (!client.session) throw new Error('Authentication required');

  try {
    // Check if tag exists
    const { data: existingTag, error: searchError } = await supabase
      .from('file_tags')
      .select()
      .eq('name', name.toLowerCase().trim())
      .single();

    if (searchError && searchError.code !== 'PGRST116') { // PGRST116 is "not found" error
      throw searchError;
    }

    if (existingTag) {
      return {
        ...existingTag,
        metadata: existingTag.metadata ? {
          usage_stats: {
            total_uses: (existingTag.metadata as any)?.usage_stats?.total_uses ?? 0,
            last_used: (existingTag.metadata as any)?.usage_stats?.last_used ?? null,
            file_count: (existingTag.metadata as any)?.usage_stats?.file_count ?? 0
          }
        } : null
      } as Tag;
    }

    const initialMetadata = {
      usage_stats: {
        total_uses: 0,
        last_used: null,
        file_count: 0
      }
    };

    // Create new tag
    const { data: newTag, error: createError } = await supabase
      .from('file_tags')
      .insert({
        name: name.toLowerCase().trim(),
        category,
        type: 'custom',
        is_system: false,
        metadata: initialMetadata as any
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    return {
      ...newTag,
      metadata: initialMetadata
    } as Tag;
  } catch (error) {
    console.error('Error in createTag:', error);
    throw error;
  }
}

/**
 * Assigns a tag to a file in the context of a message
 */
export async function assignTagToFile(
  messageId: string, 
  fileId: string, 
  tagId: string, 
  aiContext: string | null = null
) {
  const { data: client } = await supabase.auth.getSession();
  if (!client.session) throw new Error('Authentication required');

  try {
    // Check if association exists
    const { data: existingAssoc, error: searchError } = await supabase
      .from('message_file_tags')
      .select()
      .match({ message_id: messageId, file_id: fileId, tag_id: tagId })
      .single();

    if (searchError && searchError.code !== 'PGRST116') {
      throw searchError;
    }

    if (existingAssoc) {
      // Update existing association
      const { data: updatedAssoc, error: updateError } = await supabase
        .from('message_file_tags')
        .update({
          usage_count: (existingAssoc.usage_count || 0) + 1,
          ai_context: aiContext || existingAssoc.ai_context
        })
        .match({ message_id: messageId, file_id: fileId, tag_id: tagId })
        .select()
        .single();

      if (updateError) throw updateError;
      return updatedAssoc as MessageFileTag;
    }

    // Create new association
    const { data: newAssoc, error: createError } = await supabase
      .from('message_file_tags')
      .insert({
        message_id: messageId,
        file_id: fileId,
        tag_id: tagId,
        ai_context: aiContext,
        usage_count: 1
      })
      .select()
      .single();

    if (createError) throw createError;
    return newAssoc as MessageFileTag;
  } catch (error) {
    console.error('Error in assignTagToFile:', error);
    throw error;
  }
}

/**
 * Fetches all tags associated with a file, including usage statistics
 */
export async function fetchFileTags(fileId: string) {
  try {
    const { data: tags, error } = await supabase
      .from('message_file_tags')
      .select(`
        tag_id,
        ai_context,
        usage_count,
        file_tags (
          id,
          name,
          type,
          category,
          is_system,
          metadata
        )
      `)
      .eq('file_id', fileId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching file tags:', error);
      throw new Error(`Failed to fetch file tags: ${error.message}`);
    }

    return tags;
  } catch (error) {
    console.error('Error in fetchFileTags:', error);
    throw error;
  }
}

/**
 * Creates a tag if it doesn't exist and assigns it to a file
 */
export async function createAndAssignTag(
  name: string,
  messageId: string,
  fileId: string,
  category: string | null = null,
  aiContext: string | null = null
) {
  try {
    const tag = await createTag(name, category);
    const messageFileTag = await assignTagToFile(messageId, fileId, tag.id, aiContext);
    return { tag, messageFileTag };
  } catch (error) {
    console.error('Error in createAndAssignTag:', error);
    throw error;
  }
}
