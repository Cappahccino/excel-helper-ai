
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { MessageStatus } from "@/types/chat";

interface ProcessingStage {
  stage: string;
  started_at: number;
  last_updated: number;
  completion_percentage?: number;
}

interface StreamingState {
  messageId: string | null;
  status: MessageStatus;
  content: string;
  processingStage?: ProcessingStage;
}

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
  const [streamingStates, setStreamingStates] = useState<Record<string, StreamingState>>({});
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;

    console.log('Subscribing to chat updates for session:', sessionId);

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
            
            console.log('Message update received:', {
              messageId: message.id,
              status: message.status,
              content: message.content,
              hasContent,
              event: payload.eventType,
              processingStage: message.processing_stage
            });
            
            // Update streaming state for this specific message
            setStreamingStates(prev => ({
              ...prev,
              [message.id]: {
                messageId: message.id,
                status: message.status,
                content: message.content || '',
                processingStage: message.processing_stage
              }
            }));

            // Handle different types of updates
            if (payload.eventType === 'INSERT') {
              // New message created
              await queryClient.invalidateQueries({ 
                queryKey: ['chat-messages', sessionId]
              });
            } else if (message.status === 'completed' || message.status === 'failed') {
              // Message completed or failed
              console.log(`Message ${message.id} ${message.status}`);
              await queryClient.invalidateQueries({ 
                queryKey: ['chat-messages', sessionId],
                refetchType: 'active'
              });
              await refetch();
              
              if (message.status === 'completed' && message.role === 'assistant') {
                onAssistantMessage?.();
              }
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

  // Find the latest message state
  const latestMessage = Object.values(streamingStates)
    .sort((a, b) => {
      if (!a || !b) return 0;
      return (b.processingStage?.last_updated || 0) - (a.processingStage?.last_updated || 0);
    })[0] || {
      messageId: null,
      status: 'queued' as MessageStatus,
      content: '',
    };

  return {
    latestMessageId: latestMessage.messageId,
    status: latestMessage.status,
    content: latestMessage.content,
    processingStage: latestMessage.processingStage,
    refetchMessages: refetch
  };
}
