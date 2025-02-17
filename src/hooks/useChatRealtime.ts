
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { MessageStatus } from "@/types/chat";
import { useToast } from "@/hooks/use-toast";

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
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleMessageUpdate = useCallback(async (payload: any) => {
    if (!payload.new) return;

    const message = payload.new;
    const hasContent = message.content && message.content.trim().length > 0;
    
    console.log('Message update received:', {
      messageId: message.id,
      status: message.status,
      hasContent,
      event: payload.eventType,
      processingStage: message.processing_stage
    });
    
    // Update streaming state
    setStreamingStates(prev => ({
      ...prev,
      [message.id]: {
        messageId: message.id,
        status: message.status,
        content: message.content || '',
        processingStage: message.processing_stage
      }
    }));

    try {
      // Handle different types of updates
      if (payload.eventType === 'INSERT') {
        await queryClient.invalidateQueries({ 
          queryKey: ['chat-messages', sessionId]
        });
      } else if (message.status === 'completed' || message.status === 'failed') {
        console.log(`Message ${message.id} ${message.status}`);
        
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

        if (message.status === 'failed') {
          toast({
            title: "Error",
            description: "Failed to process message. Please try again.",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('Error handling message update:', error);
      toast({
        title: "Error",
        description: "Failed to update messages. Please refresh the page.",
        variant: "destructive"
      });
    }
  }, [sessionId, queryClient, onAssistantMessage, refetch, toast]);

  useEffect(() => {
    if (!sessionId) {
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('connecting');
    console.log('Subscribing to chat updates for session:', sessionId);

    let retryCount = 0;
    const maxRetries = 3;

    const setupChannel = () => {
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
            setConnectionStatus('connected');
            retryCount = 0;
          } else if (status === 'CHANNEL_ERROR' && retryCount < maxRetries) {
            console.log(`Retrying subscription... Attempt ${retryCount + 1}`);
            retryCount++;
            setTimeout(() => {
              supabase.removeChannel(channel);
              setupChannel();
            }, 1000 * Math.pow(2, retryCount)); // Exponential backoff
          } else if (retryCount >= maxRetries) {
            console.error('Failed to establish realtime connection after multiple attempts');
            setConnectionStatus('disconnected');
            toast({
              title: "Connection Error",
              description: "Failed to establish realtime connection. Messages may not update automatically.",
              variant: "destructive"
            });
          }
        });

      return channel;
    };

    const channel = setupChannel();

    return () => {
      console.log('Cleaning up chat subscription:', sessionId);
      setConnectionStatus('disconnected');
      supabase.removeChannel(channel);
    };
  }, [sessionId, handleMessageUpdate, toast]);

  // Get latest message state
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
    connectionStatus,
    refetchMessages: refetch
  };
}
