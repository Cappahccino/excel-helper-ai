
import { supabase } from "@/integrations/supabase/client";
import { Tag, MessageFileTag } from "@/types/tags";

export async function fetchTags() {
  const { data: tags, error } = await supabase
    .from('file_tags')
    .select('*')
    .order('name');

  if (error) throw error;
  return tags as Tag[];
}

export async function createTag(name: string, category: string | null = null) {
  const { data: tag, error } = await supabase
    .from('file_tags')
    .insert({
      name,
      category,
      type: 'custom'
    })
    .select()
    .single();

  if (error) throw error;
  return tag as Tag;
}

export async function assignTagToFile(
  messageId: string, 
  fileId: string, 
  tagId: string, 
  aiContext: string | null = null
) {
  const { data: messageFileTag, error } = await supabase
    .from('message_file_tags')
    .insert({
      message_id: messageId,
      file_id: fileId,
      tag_id: tagId,
      ai_context: aiContext
    })
    .select()
    .single();

  if (error) throw error;
  return messageFileTag as MessageFileTag;
}

export async function fetchFileTags(fileId: string) {
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
    .eq('file_id', fileId);

  if (error) throw error;
  return tags;
}
