
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { RealtimeChannel } from "@supabase/supabase-js";

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

    const channel: RealtimeChannel = supabase
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
              
              queryClient.setQueryData(['chat-messages', sessionId], (oldData: any) => {
                if (!oldData?.pages) return oldData;
                
                const lastPage = oldData.pages[oldData.pages.length - 1];
                const messageIndex = lastPage.messages.findIndex((msg: any) => msg.id === payload.new.id);
                
                if (messageIndex === -1) {
                  return {
                    ...oldData,
                    pages: [
                      ...oldData.pages.slice(0, -1),
                      {
                        ...lastPage,
                        messages: [...lastPage.messages, payload.new]
                      }
                    ]
                  };
                }
                
                return {
                  ...oldData,
                  pages: oldData.pages.map((page: any, pageIndex: number) => {
                    if (pageIndex !== oldData.pages.length - 1) return page;
                    return {
                      ...page,
                      messages: page.messages.map((msg: any) =>
                        msg.id === payload.new.id ? { ...msg, content: payload.new.content } : msg
                      )
                    };
                  })
                };
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

    // Handle connection issues by resubscribing
    channel.on('system', { event: 'disconnect' }, () => {
      console.log('Channel disconnected, attempting to reconnect...');
      setTimeout(() => {
        channel.subscribe();
      }, 5000);
    });

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId, queryClient, onAssistantMessage, streamingState.isStreaming]);

  return {
    latestMessageId: streamingState.messageId,
    isStreaming: streamingState.isStreaming,
    streamingProgress: streamingState.progress
  };
}
