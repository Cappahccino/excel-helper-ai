
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export async function processMessageTags(messageId: string, fileIds: string[], tagNames: string[], userId: string) {
  const { data, error } = await supabase.functions.invoke('tag-operations', {
    body: {
      messageId,
      fileIds,
      tagNames,
      userId
    }
  });

  if (error) {
    console.error('Error processing tags:', error);
    return { success: false, error };
  }

  return {
    success: true,
    data,
    hasErrors: data.errors && data.errors.length > 0,
    successCount: data.results?.length || 0,
    errorCount: data.errors?.length || 0
  };
}
