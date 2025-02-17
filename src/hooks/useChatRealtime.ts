
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { MessageStatus, Message, MessagesResponse } from "@/types/chat";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { InfiniteData } from "@tanstack/react-query";

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
  timestamp: number;
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
  thread_message_id?: string | null;
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

  const cleanupStreamingStates = () => {
    const now = Date.now();
    setStreamingStates(prev => {
      const updated = { ...prev };
      Object.entries(updated).forEach(([id, state]) => {
        // Clean up completed or failed messages after 5 seconds
        if ((state.status === 'completed' || state.status === 'failed') && now - state.timestamp > 5000) {
          delete updated[id];
        }
        // Clean up stale in_progress messages after 30 seconds
        if (state.status === 'in_progress' && now - state.timestamp > 30000) {
          delete updated[id];
        }
      });
      return updated;
    });
  };

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
            processingStage: message.processing_stage,
            threadMessageId: message.thread_message_id
          });

          // Only update state for messages that are part of the current session
          if (message.session_id !== sessionId) {
            console.log("Ignoring message from different session:", message.session_id);
            return;
          }

          setStreamingStates(prev => {
            const existingState = prev[message.id];
            const newState: StreamingState = {
              messageId: message.id,
              status: message.status,
              content: message.content || existingState?.content || '',
              processingStage: message.processing_stage,
              timestamp: Date.now()
            };

            // Clean up completed or failed messages after a delay
            if (message.status === 'completed' || message.status === 'failed') {
              setTimeout(cleanupStreamingStates, 5000);
            }

            return {
              ...prev,
              [message.id]: newState
            };
          });

          if (payload.eventType === 'INSERT') {
            await queryClient.invalidateQueries({ 
              queryKey: ['chat-messages', sessionId]
            });
            await refetch();
          } else if (message.status === 'completed' || message.status === 'failed') {
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
      setStreamingStates({});
    };
  }, [sessionId, queryClient, onAssistantMessage, refetch]);

  const getLatestActiveMessage = () => {
    const queryData = queryClient.getQueryData<InfiniteData<MessagesResponse>>(['chat-messages', sessionId]);
    const messages = queryData?.pages?.[0]?.messages || [];
    
    // First check streaming states for active messages
    const activeStates = Object.values(streamingStates).filter(
      state => state.status === 'in_progress'
    );

    if (activeStates.length > 0) {
      // Get the most recent active state
      return activeStates.sort((a, b) => b.timestamp - a.timestamp)[0];
    }

    // Then check for optimistic updates in the messages list
    const latestOptimistic = messages.find(
      (msg: Message) => msg.status === 'in_progress' && msg.role === 'assistant'
    );

    if (latestOptimistic) {
      return {
        messageId: latestOptimistic.id,
        status: latestOptimistic.status as MessageStatus,
        content: latestOptimistic.content,
        processingStage: latestOptimistic.metadata?.processing_stage,
        timestamp: Date.now()
      };
    }

    // If no active messages found, return null to indicate no loading state needed
    return null;
  };

  const latestMessage = getLatestActiveMessage();

  // Only return in_progress status if there's an actual message being processed
  return {
    latestMessageId: latestMessage?.messageId || null,
    status: latestMessage ? latestMessage.status : 'completed',
    content: latestMessage?.content || '',
    processingStage: latestMessage?.processingStage,
    refetchMessages: refetch
  };
}
