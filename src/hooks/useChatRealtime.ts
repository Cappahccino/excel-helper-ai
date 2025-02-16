
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
            
            // Reset processing state when content is received
            const hasContent = message.content && message.content.trim().length > 0;
            
            setStreamingState(prev => ({
              messageId: message.id,
              isStreaming: false, // We don't need streaming state anymore
              streamingProgress: hasContent ? 100 : 0,
              // Only show analyzing when there's no content
              isAnalyzing: !hasContent && message.status === 'processing'
            }));

            // Trigger callback when message has content
            if (hasContent && message.role === 'assistant') {
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
