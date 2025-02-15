
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Message } from "@/types/chat";

export function useMessageList(sessionId: string | null) {
  const { data: session } = useSession(sessionId);

  return useQuery({
    queryKey: ['chat-messages', session?.session_id],
    queryFn: async () => {
      if (!session?.session_id) return [];
      
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, excel_files(filename, file_size)')
        .eq('session_id', session.session_id)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }

      return data?.map(msg => ({
        ...msg,
        role: msg.role === 'assistant' ? 'assistant' : 'user'
      })) as Message[];
    },
    enabled: !!session?.session_id,
  });
}
