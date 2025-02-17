
import { useState, useEffect, useCallback } from "react";
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
  const [isSubscribed, setIsSubscribed] = useState(false);
  const queryClient = useQueryClient();

  const handleMessageUpdate = useCallback(async (payload: any) => {
    try {
      if (!payload.new) return;

      const message = payload.new;
      const hasContent = message.content && message.content.trim().length > 0;
      
      console.log('Message update received:', {
        messageId: message.id,
        status: message.status,
        content: hasContent ? 'content present' : 'no content',
        event: payload.eventType,
        processingStage: message.processing_stage
      });
      
      setStreamingStates(prev => ({
        ...prev,
        [message.id]: {
          messageId: message.id,
          status: message.status,
          content: message.content || '',
          processingStage: message.processing_stage
        }
      }));

      if (payload.eventType === 'INSERT') {
        await queryClient.invalidateQueries({ 
          queryKey: ['chat-messages', sessionId]
        });
      } else if (message.status === 'completed' || message.status === 'failed') {
        console.log(`Message ${message.id} ${message.status}`);
        
        // Batch these operations together
        await Promise.all([
          queryClient.invalidateQueries({ 
            queryKey: ['chat-messages', sessionId],
            refetchType: 'active'
          }),
          refetch()
        ]);
        
        if (message.status === 'completed' && message.role === 'assistant') {
          onAssistantMessage?.();
        }
      }
    } catch (error) {
      console.error('Error handling message update:', error);
    }
  }, [sessionId, queryClient, onAssistantMessage, refetch]);

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
        handleMessageUpdate
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to chat updates:', sessionId);
          setIsSubscribed(true);
        }
      });

    return () => {
      console.log('Cleaning up chat subscription:', sessionId);
      setIsSubscribed(false);
      supabase.removeChannel(channel);
    };
  }, [sessionId, handleMessageUpdate]);

  // Get latest message state with memoized sort
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
    isSubscribed,
    refetchMessages: refetch
  };
}
