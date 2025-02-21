
import { supabase } from "@/integrations/supabase/client";
import { Tag, MessageFileTag } from "@/types/tags";

/**
 * Fetches all available tags
 */
export async function fetchTags() {
  const { data: tags, error } = await supabase
    .from('file_tags')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching tags:', error);
    throw new Error(`Failed to fetch tags: ${error.message}`);
  }
  
  return tags as Tag[];
}

/**
 * Creates a new tag if it doesn't exist
 */
export async function createTag(name: string, category: string | null = null) {
  try {
    // First check if tag already exists (case insensitive)
    const { data: existingTags, error: searchError } = await supabase
      .from('file_tags')
      .select('*')
      .ilike('name', name)
      .limit(1);

    if (searchError) {
      console.error('Error searching for existing tag:', searchError);
      throw new Error(`Failed to check for existing tag: ${searchError.message}`);
    }

    // If tag exists, return the existing tag
    if (existingTags && existingTags.length > 0) {
      return existingTags[0] as Tag;
    }

    // Validate tag name
    if (!name || name.trim().length === 0) {
      throw new Error('Tag name cannot be empty');
    }

    if (name.length > 50) {
      throw new Error('Tag name cannot exceed 50 characters');
    }

    // Create new tag
    const { data: tag, error: createError } = await supabase
      .from('file_tags')
      .insert({
        name: name.toLowerCase().trim(),
        category,
        type: 'custom',
        is_system: false
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating tag:', createError);
      throw new Error(`Failed to create tag: ${createError.message}`);
    }

    console.log('Successfully created tag:', tag);
    return tag as Tag;
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
  try {
    // Validate inputs
    if (!messageId || !fileId || !tagId) {
      throw new Error('Missing required parameters for tag assignment');
    }

    // Check if association already exists
    const { data: existingAssoc, error: checkError } = await supabase
      .from('message_file_tags')
      .select('*')
      .eq('message_id', messageId)
      .eq('file_id', fileId)
      .eq('tag_id', tagId)
      .limit(1);

    if (checkError) {
      console.error('Error checking existing tag association:', checkError);
      throw new Error(`Failed to check existing tag association: ${checkError.message}`);
    }

    // If association exists, return it
    if (existingAssoc && existingAssoc.length > 0) {
      return existingAssoc[0] as MessageFileTag;
    }

    // Create new association
    const { data: messageFileTag, error } = await supabase
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

    if (error) {
      console.error('Error assigning tag to file:', error);
      throw new Error(`Failed to assign tag to file: ${error.message}`);
    }

    console.log('Successfully assigned tag to file:', messageFileTag);
    return messageFileTag as MessageFileTag;
  } catch (error) {
    console.error('Error in assignTagToFile:', error);
    throw error;
  }
}

/**
 * Fetches all tags associated with a file
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
          is_system
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
    // Create or get existing tag
    const tag = await createTag(name, category);
    
    // Assign tag to file
    const messageFileTag = await assignTagToFile(messageId, fileId, tag.id, aiContext);
    
    return {
      tag,
      messageFileTag
    };
  } catch (error) {
    console.error('Error in createAndAssignTag:', error);
    throw error;
  }
}
