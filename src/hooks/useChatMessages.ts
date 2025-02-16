import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { useNavigate } from "react-router-dom";

const MESSAGES_PER_PAGE = 50;

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  session_id: string | null;
  created_at: string;
  excel_file_id: string | null;
  excel_files?: {
    filename: string;
    file_size: number;
  } | null;
  temp?: boolean;
  isStreaming?: boolean;
}

export function useChatMessages(sessionId: string | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: session, isLoading: sessionLoading } = useInfiniteQuery({
    queryKey: ['chat-session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: sessionData, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('session_id, thread_id')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (sessionError) {
        console.error('Error fetching session:', sessionError);
        throw sessionError;
      }

      return sessionData;
    },
    enabled: !!sessionId,
  });

  const { 
    data, 
    isLoading: messagesLoading, 
    isError, 
    refetch,
    hasNextPage,
    fetchNextPage 
  } = useInfiniteQuery({
    queryKey: ['chat-messages', session?.pages?.[0]?.session_id],
    queryFn: async ({ pageParam = null }) => {
      if (!session?.pages?.[0]?.session_id) return { messages: [], nextCursor: null };
      
      let query = supabase
        .from('chat_messages')
        .select('*, excel_files(filename, file_size)')
        .eq('session_id', session.pages[0].session_id)
        .order('created_at', { ascending: true })
        .limit(MESSAGES_PER_PAGE);

      if (pageParam) {
        query = query.lt('created_at', pageParam);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }

      const messages = data?.map(msg => ({
        ...msg,
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        isStreaming: msg.is_streaming || false
      })) as Message[];

      const nextCursor = messages.length === MESSAGES_PER_PAGE 
        ? messages[messages.length - 1]?.created_at 
        : null;

      return {
        messages,
        nextCursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!session?.pages?.[0]?.session_id,
  });

  const messages = data?.pages.flatMap(page => page.messages) ?? [];

  const sendMessage = useMutation({
    mutationFn: async ({ content, fileId }: { content: string; fileId?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      let currentSessionId = sessionId;

      if (!currentSessionId) {
        const { data: newSession, error: sessionError } = await supabase
          .from('chat_sessions')
          .insert({
            user_id: user.id,
            status: 'active',
            thread_id: null,
            chat_name: 'New Chat'
          })
          .select()
          .single();

        if (sessionError) throw sessionError;
        currentSessionId = newSession.session_id;
      }

      const { data: storedMessage, error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          content,
          role: 'user' as const,
          session_id: currentSessionId,
          excel_file_id: fileId,
          is_ai_response: false,
          user_id: user.id
        })
        .select('*, excel_files(filename, file_size)')
        .single();

      if (messageError) throw messageError;

      return { storedMessage, newSessionId: currentSessionId };
    },
    onMutate: async ({ content, fileId }) => {
      const optimisticMessage: Message = {
        id: crypto.randomUUID(),
        content,
        role: 'user',
        session_id: sessionId,
        created_at: new Date().toISOString(),
        excel_file_id: fileId || null,
        temp: true
      };

      await queryClient.cancelQueries({ queryKey: ['chat-messages', sessionId] });
      const previousMessages = queryClient.getQueryData(['chat-messages', sessionId]) as Message[] || [];

      queryClient.setQueryData(['chat-messages', sessionId], (old: Message[] = []) => {
        return [...old, optimisticMessage];
      });

      return { previousMessages, optimisticMessage };
    },
    onSuccess: async ({ storedMessage, newSessionId }, variables, context) => {
      queryClient.setQueryData(['chat-messages', newSessionId], (old: Message[] = []) => {
        return old.map(msg => 
          msg.temp && msg.content === context?.optimisticMessage.content
            ? { ...storedMessage, role: 'user' as const, temp: false }
            : msg
        );
      });

      queryClient.invalidateQueries({ queryKey: ['chat-messages', newSessionId] });
      queryClient.invalidateQueries({ queryKey: ['chat-session', newSessionId] });

      if (!sessionId && newSessionId) {
        const queryParams = new URLSearchParams();
        queryParams.set('sessionId', newSessionId);
        if (storedMessage.excel_file_id) {
          queryParams.set('fileId', storedMessage.excel_file_id);
        }
        navigate(`/chat?${queryParams.toString()}`);
      }

      generateAIResponse.mutate({
        content: variables.content,
        fileId: variables.fileId,
        sessionId: newSessionId
      });
    },
    onError: (_, __, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['chat-messages', sessionId], context.previousMessages);
      }
    }
  });

  const generateAIResponse = useMutation({
    mutationFn: async ({ content, fileId, sessionId }: { content: string; fileId?: string | null; sessionId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error: aiError } = await supabase.functions.invoke('excel-assistant', {
        body: {
          fileId,
          query: content,
          userId: user.id,
          sessionId: sessionId,
          threadId: session?.thread_id
        }
      });

      if (aiError) throw aiError;
      return { sessionId };
    },
    onError: (error) => {
      console.error('AI Response error:', error);
    }
  });

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return `Today at ${format(date, 'HH:mm')}`;
    } else if (isYesterday(date)) {
      return `Yesterday at ${format(date, 'HH:mm')}`;
    }
    return format(date, 'MMM d, yyyy HH:mm');
  };

  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { [key: string]: Message[] } = {};
    
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

  return {
    messages,
    session: session?.pages?.[0],
    isLoading: sessionLoading || messagesLoading,
    isError,
    sendMessage,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage
  };
}
