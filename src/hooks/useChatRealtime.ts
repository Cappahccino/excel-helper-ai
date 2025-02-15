
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface UseChatRealtimeProps {
  sessionId: string | null;
  onAssistantMessage: () => void;
}

export function useChatRealtime({ sessionId, onAssistantMessage }: UseChatRealtimeProps) {
  const [latestMessageId, setLatestMessageId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`chat_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload: any) => {
          if (payload.new) {
            setLatestMessageId(payload.new.id);
            
            // Only trigger onAssistantMessage when the message is complete
            if (payload.new.role === 'assistant' && !payload.new.is_streaming) {
              onAssistantMessage();
            }

            // Always invalidate queries to update UI
            await queryClient.invalidateQueries({ queryKey: ['chat-messages', sessionId] });
            await queryClient.invalidateQueries({ queryKey: ['chat-session', sessionId] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient, onAssistantMessage]);

  return { latestMessageId };
}
