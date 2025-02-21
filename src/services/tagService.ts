
import { supabase } from "@/integrations/supabase/client";
import { Tag, MessageFileTag } from "@/types/tags";

/**
 * Fetches all available tags with their usage statistics
 */
export async function fetchTags() {
  const { data: tags, error } = await supabase
    .from('file_tags')
    .select('*, metadata->usage_stats as usage_stats')
    .order('name');

  if (error) {
    console.error('Error fetching tags:', error);
    throw new Error(`Failed to fetch tags: ${error.message}`);
  }
  
  return tags as (Tag & { usage_stats?: { total_uses: number; last_used: string; file_count: number } })[];
}

/**
 * Creates a new tag if it doesn't exist, with transaction support
 */
export async function createTag(name: string, category: string | null = null) {
  const { data: client } = await supabase.auth.getSession();
  if (!client.session) throw new Error('Authentication required');

  try {
    // Start a Supabase transaction
    const { data, error } = await supabase.rpc('create_tag_with_validation', {
      p_name: name.toLowerCase().trim(),
      p_category: category,
      p_type: 'custom',
      p_is_system: false
    });

    if (error) {
      console.error('Error in createTag transaction:', error);
      throw new Error(`Failed to create tag: ${error.message}`);
    }

    return data as Tag;
  } catch (error) {
    console.error('Error in createTag:', error);
    throw error;
  }
}

/**
 * Assigns a tag to a file in the context of a message with transaction support
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
    // Validate inputs
    if (!messageId || !fileId || !tagId) {
      throw new Error('Missing required parameters for tag assignment');
    }

    // Use RPC call for atomic tag assignment
    const { data, error } = await supabase.rpc('assign_tag_to_file', {
      p_message_id: messageId,
      p_file_id: fileId,
      p_tag_id: tagId,
      p_ai_context: aiContext
    });

    if (error) {
      console.error('Error in assignTagToFile transaction:', error);
      throw new Error(`Failed to assign tag to file: ${error.message}`);
    }

    return data as MessageFileTag;
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
          metadata->usage_stats
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
 * Creates a tag if it doesn't exist and assigns it to a file with transaction support
 */
export async function createAndAssignTag(
  name: string,
  messageId: string,
  fileId: string,
  category: string | null = null,
  aiContext: string | null = null
) {
  try {
    // Use RPC call for atomic tag creation and assignment
    const { data, error } = await supabase.rpc('create_and_assign_tag', {
      p_tag_name: name.toLowerCase().trim(),
      p_message_id: messageId,
      p_file_id: fileId,
      p_category: category,
      p_ai_context: aiContext
    });

    if (error) {
      console.error('Error in createAndAssignTag transaction:', error);
      throw new Error(`Failed to create and assign tag: ${error.message}`);
    }

    return data as { tag: Tag; messageFileTag: MessageFileTag };
  } catch (error) {
    console.error('Error in createAndAssignTag:', error);
    throw error;
  }
}
