import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, isToday, isYesterday } from "date-fns";

type MessageStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';
type MessageRole = 'user' | 'assistant';

interface Message {
  id: string;
  content: string;
  role: MessageRole;
  created_at: string;
  status: MessageStatus;
  excel_files?: {
    filename: string;
    file_size: number;
  } | null;
}

interface UseChatControllerOptions {
  sessionId: string | null;
  fileId: string | null;
  onMessageSent?: () => void;
}

export function useChatController({ 
  sessionId, 
  fileId,
  onMessageSent 
}: UseChatControllerOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hasScrolledUp, setHasScrolledUp] = useState(false);
  const [status, setStatus] = useState<MessageStatus>('completed');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [latestMessageId, setLatestMessageId] = useState<string | null>(null);

  const fetchMessages = async () => {
    if (!sessionId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, excel_files(filename, file_size)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const transformedMessages: Message[] = data?.map(msg => ({
        id: msg.id,
        content: msg.content,
        role: msg.role as MessageRole,
        created_at: msg.created_at,
        status: msg.status as MessageStatus,
        excel_files: msg.excel_files
      })) || [];

      setMessages(transformedMessages);
      setIsError(false);
    } catch (error) {
      console.error('Error fetching messages:', error);
      setIsError(true);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

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
            const isComplete = message.status === 'completed';
            
            setLatestMessageId(message.id);
            setStatus(message.status);

            if (isComplete && hasContent) {
              await queryClient.invalidateQueries({ 
                queryKey: ['chat-messages', sessionId] 
              });
              
              if (!hasScrolledUp && message.role === 'assistant') {
                scrollToBottom('smooth');
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient, hasScrolledUp]);

  const sendMessage = async (content: string, messageFileId?: string | null) => {
    if (!content.trim() && !messageFileId) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      let currentSessionId = sessionId;
      
      if (!currentSessionId) {
        const { data: newSession, error: sessionError } = await supabase
          .from('chat_sessions')
          .insert([{ 
            user_id: user.id,
            status: 'active'
          }])
          .select('session_id')
          .single();

        if (sessionError) throw sessionError;
        currentSessionId = newSession.session_id;
      }

      const { error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          content,
          role: 'user',
          session_id: currentSessionId,
          excel_file_id: messageFileId || fileId || null,
          is_ai_response: false,
          user_id: user.id,
          status: 'completed'
        });
      
      if (messageError) throw messageError;

      const { data: assistantMessage, error: assistantError } = await supabase
        .from('chat_messages')
        .insert({
          content: '',
          role: 'assistant',
          session_id: currentSessionId,
          excel_file_id: messageFileId || fileId || null,
          is_ai_response: true,
          user_id: user.id,
          status: 'queued'
        })
        .select()
        .single();

      if (assistantError) throw assistantError;

      const { error } = await supabase.functions.invoke('excel-assistant', {
        body: { 
          fileId: messageFileId || fileId || null,
          query: content,
          userId: user.id,
          sessionId: currentSessionId,
          messageId: assistantMessage.id
        }
      });

      if (error) throw error;
      
      onMessageSent?.();
      
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive"
      });
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return `Today at ${format(date, 'HH:mm')}`;
    } else if (isYesterday(date)) {
      return `Yesterday at ${format(date, 'HH:mm')}`;
    }
    return format(date, 'MMM d, yyyy HH:mm');
  };

  const groupMessagesByDate = () => {
    const groups: Record<string, Message[]> = {};
    
    messages.forEach(msg => {
      const date = new Date(msg.created_at);
      let key = format(date, 'yyyy-MM-dd');
      
      if (isToday(date)) {
        key = 'Today';
      } else if (isYesterday(date)) {
        key = 'Yesterday';
      }
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(msg);
    });
    
    return groups;
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      const viewportElement = viewport as HTMLElement;
      viewportElement.scrollTop = viewportElement.scrollHeight;
    }
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 1;
    setHasScrolledUp(!isAtBottom);
  };

  return {
    messages,
    isLoading,
    isError,
    status,
    latestMessageId,
    sendMessage,
    formatTimestamp,
    groupMessagesByDate,
    hasScrolledUp,
    scrollToBottom,
    handleScroll,
    refetchMessages: fetchMessages
  };
}
