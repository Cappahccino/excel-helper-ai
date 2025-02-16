
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface StreamingState {
  messageId: string | null;
  isStreaming: boolean;
  progress: number;
}

interface UseChatRealtimeProps {
  sessionId: string | null;
  onAssistantMessage: () => void;
}

export function useChatRealtime({ sessionId, onAssistantMessage }: UseChatRealtimeProps) {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    messageId: null,
    isStreaming: false,
    progress: 0
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;

    // Dynamic polling interval based on streaming state
    const pollingInterval = streamingState.isStreaming ? 500 : 2000;
    let lastUpdate = Date.now();

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
            const currentTime = Date.now();
            const timeSinceLastUpdate = currentTime - lastUpdate;
            
            // Update streaming state
            if (payload.new.role === 'assistant') {
              setStreamingState(prev => ({
                messageId: payload.new.id,
                isStreaming: payload.new.is_streaming,
                progress: payload.new.is_streaming ? prev.progress + 1 : 100
              }));

              // Trigger callback only when message is complete and enough time has passed
              if (!payload.new.is_streaming && timeSinceLastUpdate >= pollingInterval) {
                onAssistantMessage();
                lastUpdate = currentTime;
              }
            }

            // Optimistic cache update for streaming content
            if (payload.new.is_streaming) {
              await queryClient.cancelQueries({ queryKey: ['chat-messages', sessionId] });
              
              queryClient.setQueryData(['chat-messages', sessionId], (oldData: any[] = []) => {
                const messageIndex = oldData.findIndex(msg => msg.id === payload.new.id);
                
                if (messageIndex === -1) {
                  return [...oldData, payload.new];
                }
                
                return oldData.map(msg =>
                  msg.id === payload.new.id ? { ...msg, content: payload.new.content } : msg
                );
              });
            } else {
              // Full query invalidation only when streaming is complete
              await queryClient.invalidateQueries({ 
                queryKey: ['chat-messages', sessionId],
                refetchType: 'active'
              });
              await queryClient.invalidateQueries({ 
                queryKey: ['chat-session', sessionId],
                refetchType: 'active'
              });
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to real-time updates for session ${sessionId}`);
        }
      });

    // Automatic reconnection
    let reconnectTimeout: NodeJS.Timeout;
    
    channel.onError(() => {
      console.log('Channel error, attempting to reconnect...');
      clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(() => {
        channel.subscribe();
      }, 5000);
    });

    return () => {
      clearTimeout(reconnectTimeout);
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient, onAssistantMessage, streamingState.isStreaming]);

  return {
    latestMessageId: streamingState.messageId,
    isStreaming: streamingState.isStreaming,
    streamingProgress: streamingState.progress
  };
}
