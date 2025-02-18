
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { Message, ProcessingStage } from '@/types/chat';
import { useQueryClient } from '@tanstack/react-query';

interface UseChatRealtimeProps {
  sessionId: string | null;
  refetch: () => Promise<any>;
  onAssistantMessage?: (message: Message) => void;
}

export function useChatRealtime({ sessionId, refetch, onAssistantMessage }: UseChatRealtimeProps) {
  const [status, setStatus] = useState<Message['status']>();
  const [content, setContent] = useState<string>();
  const [latestMessageId, setLatestMessageId] = useState<string>();
  const [processingStage, setProcessingStage] = useState<ProcessingStage>();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;

    console.log('Setting up realtime subscription for session:', sessionId);
    
    const channel = supabase
      .channel('chat-updates')
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
          
          const message = payload.new as Message;
          
          if (message.role === 'assistant') {
            setStatus(message.status);
            setContent(message.content);
            setLatestMessageId(message.id);
            setProcessingStage(message.metadata?.processing_stage);
            
            // Update the message in the query cache immediately
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

            if (message.status === 'completed' && onAssistantMessage) {
              onAssistantMessage(message);
              await refetch();
            }
          }

          // For other status changes, ensure data consistency
          if (['failed', 'cancelled', 'expired'].includes(message.status)) {
            await refetch();
          }
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [sessionId, refetch, onAssistantMessage, queryClient]);

  return {
    status,
    content,
    latestMessageId,
    processingStage
  };
}
