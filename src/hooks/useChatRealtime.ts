import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface UseChatRealtimeProps {
  sessionId: string | null;
  onAssistantMessage?: () => void;
}

export function useChatRealtime({ sessionId, onAssistantMessage }: UseChatRealtimeProps) {
  const [streamingState, setStreamingState] = useState({
    messageId: null as string | null,
    isProcessing: false
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
            
            // Update state based on message status
            // Only keep processing if message is not complete AND has no content
            setStreamingState({
              messageId: message.id,
              isProcessing: !isComplete && !hasContent
            });

            // Notify when assistant message is complete
            if (isComplete && hasContent && message.role === 'assistant') {
              console.log('Assistant message complete:', message.id);
              onAssistantMessage?.();
            }

            await queryClient.invalidateQueries({ 
              queryKey: ['chat-messages', sessionId],
              refetchType: 'active'
            });
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
  }, [sessionId, queryClient, onAssistantMessage]);

  return {
    latestMessageId: streamingState.messageId,
    isProcessing: streamingState.isProcessing
  };
}
