
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Message, MessagesResponse, SessionData } from "@/types/chat";
import { formatTimestamp, groupMessagesByDate } from "@/utils/dateFormatting";

const MESSAGES_PER_PAGE = 50;

export function useMessages(sessionId: string | null, session: SessionData | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { 
    data, 
    isLoading, 
    isError, 
    refetch,
    hasNextPage,
    fetchNextPage 
  } = useInfiniteQuery<MessagesResponse>({
    queryKey: ['chat-messages', session?.session_id],
    queryFn: async ({ pageParam = null }) => {
      if (!session?.session_id) return { messages: [], nextCursor: null };
      
      let query = supabase
        .from('chat_messages')
        .select('*, excel_files(filename, file_size)')
        .eq('session_id', session.session_id)
        .is('deleted_at', null)
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
        status: msg.status as Message['status']
      })) as Message[];

      const nextCursor = messages.length === MESSAGES_PER_PAGE 
        ? messages[messages.length - 1]?.created_at 
        : null;

      return {
        messages,
        nextCursor,
      };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!session?.session_id,
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

      const { data: userMessage, error: userMessageError } = await supabase
        .from('chat_messages')
        .insert({
          content,
          role: 'user',
          session_id: currentSessionId,
          excel_file_id: fileId,
          is_ai_response: false,
          user_id: user.id,
          status: 'completed',
          version: '1.0.0'
        })
        .select('*, excel_files(filename, file_size)')
        .single();

      if (userMessageError) throw userMessageError;

      const { data: assistantMessage, error: assistantMessageError } = await supabase
        .from('chat_messages')
        .insert({
          content: '',
          role: 'assistant',
          session_id: currentSessionId,
          excel_file_id: fileId,
          is_ai_response: true,
          user_id: user.id,
          status: 'queued',
          version: '1.0.0',
          deployment_id: crypto.randomUUID()
        })
        .select('*, excel_files(filename, file_size)')
        .single();

      if (assistantMessageError) throw assistantMessageError;

      return { userMessage, assistantMessage, newSessionId: currentSessionId };
    },
    onMutate: async ({ content, fileId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['chat-messages', sessionId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(['chat-messages', sessionId]);

      // Create optimistic user message
      const optimisticUserMessage: Message = {
        id: `temp-${Date.now()}`,
        content,
        role: 'user',
        session_id: sessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        excel_file_id: fileId,
        status: 'completed',
        is_ai_response: false,
        version: '1.0.0',
        excel_files: null,
        metadata: null,
      };

      // Create optimistic assistant message
      const optimisticAssistantMessage: Message = {
        id: `temp-assistant-${Date.now()}`,
        content: '',
        role: 'assistant',
        session_id: sessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        excel_file_id: fileId,
        status: 'queued',
        is_ai_response: true,
        version: '1.0.0',
        deployment_id: crypto.randomUUID(),
        excel_files: null,
        metadata: null,
      };

      // Optimistically update the cache
      queryClient.setQueryData(['chat-messages', sessionId], (old: any) => ({
        pages: [
          {
            messages: [...(old?.pages[0]?.messages || []), optimisticUserMessage, optimisticAssistantMessage],
            nextCursor: old?.pages[0]?.nextCursor
          },
          ...(old?.pages.slice(1) || [])
        ],
      }));

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      // Revert to the previous state if there's an error
      if (context?.previousMessages) {
        queryClient.setQueryData(['chat-messages', sessionId], context.previousMessages);
      }
    },
    onSuccess: async ({ userMessage, assistantMessage, newSessionId }, variables) => {
      // Update cache with the actual messages
      await queryClient.invalidateQueries({ queryKey: ['chat-messages', newSessionId] });

      if (!sessionId && newSessionId) {
        const queryParams = new URLSearchParams();
        queryParams.set('sessionId', newSessionId);
        if (userMessage.excel_file_id) {
          queryParams.set('fileId', userMessage.excel_file_id);
        }
        navigate(`/chat?${queryParams.toString()}`);
      }

      generateAIResponse.mutate({
        content: variables.content,
        fileId: variables.fileId,
        sessionId: newSessionId,
        messageId: assistantMessage.id
      });
    }
  });

  const generateAIResponse = useMutation({
    mutationFn: async ({ content, fileId, sessionId, messageId }: { 
      content: string; 
      fileId?: string | null; 
      sessionId: string;
      messageId: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error: aiError } = await supabase.functions.invoke('excel-assistant', {
        body: {
          fileId,
          query: content,
          userId: user.id,
          sessionId: sessionId,
          threadId: session?.thread_id || null,
          messageId
        }
      });

      if (aiError) throw aiError;
      return { sessionId };
    },
    onError: (error) => {
      console.error('AI Response error:', error);
    }
  });

  return {
    messages,
    isLoading,
    isError,
    sendMessage,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage
  };
}
