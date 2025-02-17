
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { MessageStatus } from "@/types/chat";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

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

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  status: MessageStatus;
  processing_stage?: ProcessingStage;
  session_id: string;
}

type ChatMessageChange = RealtimePostgresChangesPayload<{
  [key: string]: any;
}>;

export function useChatRealtime({ 
  sessionId, 
  onAssistantMessage,
  refetch 
}: UseChatRealtimeProps) {
  const [streamingStates, setStreamingStates] = useState<Record<string, StreamingState>>({});
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;

    console.log("Subscribing to chat updates for session:", sessionId);

    const channel = supabase
      .channel(`chat-${sessionId}`)
      .on(
        'postgres_changes',
        { 
          event: '*',
          schema: 'public', 
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`
        },
        async (payload: ChatMessageChange) => {
          const message = payload.new as ChatMessage;
          if (!message || !message.id) return;

          console.log("🔄 Real-time update received:", {
            event: payload.eventType,
            messageId: message.id,
            status: message.status,
            hasContent: Boolean(message.content?.trim()),
            processingStage: message.processing_stage
          });

          // Update streaming state for this message
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
            // Immediately invalidate query on new message
            await queryClient.invalidateQueries({ 
              queryKey: ['chat-messages', sessionId]
            });
            
            // Force an immediate refetch
            await refetch();
          } else if (message.status === 'completed' || message.status === 'failed') {
            console.log(`Message ${message.id} final status: ${message.status}`);
            
            // Invalidate and refetch on completion or failure
            await queryClient.invalidateQueries({ 
              queryKey: ['chat-messages', sessionId],
              refetchType: 'active'
            });
            await refetch();
            
            if (message.status === 'completed' && message.role === 'assistant') {
              onAssistantMessage?.();
              
              // Clear streaming state for completed message
              setStreamingStates(prev => {
                const { [message.id]: _, ...rest } = prev;
                return rest;
              });
            }
          } else {
            // For other updates (like streaming content), just refetch
            await refetch();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to chat updates for session:', sessionId);
        } else {
          console.log('❌ Subscription status:', status);
        }
      });

    return () => {
      console.log('Cleaning up chat subscription:', sessionId);
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient, onAssistantMessage, refetch]);

  // Get the latest message state based on processing stage timestamp
  const latestMessage = Object.values(streamingStates)
    .sort((a, b) => {
      if (!a?.processingStage?.last_updated || !b?.processingStage?.last_updated) return 0;
      return b.processingStage.last_updated - a.processingStage.last_updated;
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
