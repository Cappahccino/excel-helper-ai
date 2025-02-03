import { Message } from "./Message";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface MessageListProps {
  threadId: string;
}

export function MessageList({ threadId }: MessageListProps) {
  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages?.map((message) => (
        <Message
          key={message.id}
          content={message.content}
          isAiResponse={message.is_ai_response}
          status={message.status}
        />
      ))}
    </div>
  );
}