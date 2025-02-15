
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
    isStreaming: false,
    streamingProgress: 0,
    isAnalyzing: false
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
            
            setStreamingState(prev => ({
              messageId: message.id,
              isStreaming: message.is_streaming,
              streamingProgress: message.is_streaming ? prev.streamingProgress + 1 : 100,
              isAnalyzing: !message.is_streaming && message.status === 'processing'
            }));

            // Only trigger the callback when message is complete
            if (!message.is_streaming && message.role === 'assistant') {
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
    isStreaming: streamingState.isStreaming,
    streamingProgress: streamingState.streamingProgress,
    isAnalyzing: streamingState.isAnalyzing
  };
}
