
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Message, ProcessingStage } from '@/types/chat';
import { useQueryClient } from '@tanstack/react-query';

interface UseChatRealtimeProps {
  sessionId: string | null;
  refetch: () => Promise<any>;
  onAssistantMessage?: (message: Message) => void;
  onStatusChange?: (status: Message['status'], messageId: string) => void;
}

export function useChatRealtime({ 
  sessionId, 
  refetch, 
  onAssistantMessage,
  onStatusChange
}: UseChatRealtimeProps) {
  // State for tracking the message status and content
  const [status, setStatus] = useState<Message['status']>();
  const [content, setContent] = useState<string>();
  const [latestMessageId, setLatestMessageId] = useState<string | null>(null);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>();
  
  // Connection state tracking
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  // References for cleanup and reconnection
  const channelRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const queryClient = useQueryClient();

  // Function to establish the realtime connection
  const establishConnection = useCallback(() => {
    if (!sessionId) return null;
    
    console.log('Setting up realtime subscription for session:', sessionId);
    
    const channel = supabase
      .channel(`chat-updates-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          console.log('Received realtime update:', payload);
          setIsConnected(true);
          setReconnectAttempts(0);
          
          const message = payload.new as Message;
          
          if (message.role === 'assistant') {
            setStatus(message.status);
            setContent(message.content);
            setLatestMessageId(message.id);
            setProcessingStage(message.metadata?.processing_stage);
            
            // Immediately update the query cache for a smoother UI experience
            queryClient.setQueryData(['chat-messages', sessionId], (old: any) => {
              if (!old?.pages?.[0]) return old;

              const updatedPages = old.pages.map((page: any) => ({
                ...page,
                messages: page.messages.map((msg: Message) =>
                  msg.id === message.id ? message : msg
                ),
              }));

              return {
                ...old,
                pages: updatedPages,
              };
            });

            // Notify when message is complete
            if (message.status === 'completed' && onAssistantMessage) {
              onAssistantMessage(message);
              await refetch();
            }
            
            // Notify of status changes
            if (onStatusChange) {
              onStatusChange(message.status, message.id);
            }
          }

          // For other status changes, ensure data consistency
          if (['failed', 'cancelled', 'expired'].includes(message.status)) {
            await refetch();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Successfully subscribed to updates for session ${sessionId}`);
          setIsConnected(true);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Error connecting to realtime updates for session ${sessionId}`);
          setIsConnected(false);
          scheduleReconnect();
        } else if (status === 'TIMED_OUT') {
          console.warn(`Connection timed out for session ${sessionId}`);
          setIsConnected(false);
          scheduleReconnect();
        }
      });
      
    channelRef.current = channel;
    return channel;
  }, [sessionId, refetch, onAssistantMessage, onStatusChange, queryClient]);

  // Function to schedule a reconnection attempt
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    // Exponential backoff with a maximum delay of 30 seconds
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      console.log(`Attempting to reconnect (attempt ${reconnectAttempts + 1})`);
      setReconnectAttempts(prev => prev + 1);
      
      // Clean up existing connection
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      
      // Establish new connection
      establishConnection();
    }, delay);
  }, [reconnectAttempts, establishConnection]);

  // Set up the subscription when the session ID changes
  useEffect(() => {
    const channel = establishConnection();
    
    // Clean up subscription on unmount or session change
    return () => {
      console.log('Cleaning up realtime subscription');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [sessionId, establishConnection]);

  // Reset state when session changes
  useEffect(() => {
    setStatus(undefined);
    setContent(undefined);
    setLatestMessageId(null);
    setProcessingStage(undefined);
    setIsConnected(false);
    setReconnectAttempts(0);
  }, [sessionId]);

  return {
    status,
    content,
    latestMessageId,
    processingStage,
    isConnected,
    reconnectAttempts
  };
}
