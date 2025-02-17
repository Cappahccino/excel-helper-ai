
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

// Define the shape of a chat message from Supabase
interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  status: MessageStatus;
  processing_stage?: ProcessingStage;
  session_id: string;
}

interface RealtimePayload {
  new: ChatMessage;
  old: ChatMessage;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
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
        async (payload: RealtimePayload) => {
          if (!payload.new) return;

          const message = payload.new;
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
            // New message created
            await queryClient.invalidateQueries({ 
              queryKey: ['chat-messages', sessionId]
            });
          } else if (message.status === 'completed' || message.status === 'failed') {
            // Message completed or failed
            console.log(`Message ${message.id} final status: ${message.status}`);
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
