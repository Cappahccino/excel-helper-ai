
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface UseChatRealtimeProps {
  sessionId: string | null;
  onAssistantMessage?: () => void;
  refetch: () => Promise<any>;
}

export function useChatRealtime({ 
  sessionId, 
  onAssistantMessage,
  refetch 
}: UseChatRealtimeProps) {
  const [streamingState, setStreamingState] = useState({
    messageId: null as string | null,
    status: 'queued' as 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired'
  });
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
            const message = payload.new;
            const hasContent = message.content && message.content.trim().length > 0;
            const isComplete = message.status === 'completed';
            
            console.log('Message update:', {
              messageId: message.id,
              status: message.status,
              hasContent,
              isComplete
            });
            
            // Update state with new message status
            setStreamingState({
              messageId: message.id,
              status: message.status
            });

            // Notify when assistant message is complete
            if (isComplete && hasContent && message.role === 'assistant') {
              console.log('Assistant message complete:', message.id);
              // First invalidate the query cache
              await queryClient.invalidateQueries({ 
                queryKey: ['chat-messages', sessionId],
                refetchType: 'active'
              });
              // Then explicitly refetch to ensure we have the latest data
              await refetch();
              // Finally call the onAssistantMessage callback
              onAssistantMessage?.();
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to chat updates:', sessionId);
        }
      });

    return () => {
      console.log('Unsubscribing from chat updates:', sessionId);
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient, onAssistantMessage, refetch]);

  return {
    latestMessageId: streamingState.messageId,
    status: streamingState.status,
    refetchMessages: refetch
  };
}
