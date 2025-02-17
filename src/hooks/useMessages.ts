
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Message, MessagesResponse, SessionData } from "@/types/chat";
import { formatTimestamp, groupMessagesByDate } from "@/utils/dateFormatting";
import { useToast } from "@/hooks/use-toast";

const MESSAGES_PER_PAGE = 50;

export function useMessages(sessionId: string | null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { 
    data, 
    isLoading, 
    isError, 
    refetch,
    hasNextPage,
    fetchNextPage 
  } = useInfiniteQuery<MessagesResponse>({
    queryKey: ['chat-messages', sessionId],
    queryFn: async ({ pageParam = null }) => {
      if (!sessionId) {
        return {
          messages: [],
          nextCursor: null
        };
      }
      
      let query = supabase
        .from('chat_messages')
        .select('*, excel_files(filename, file_size)')
        .eq('session_id', sessionId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(MESSAGES_PER_PAGE);

      if (pageParam) {
        query = query.lt('created_at', pageParam);
      }
      
      const { data: rawMessages, error } = await query;
      
      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }

      // Transform the raw messages to match our Message type
      const messages = (rawMessages || []).map(msg => ({
        ...msg,
        role: msg.role === 'assistant' ? 'assistant' as const : 'user' as const,
        status: msg.status as Message['status'],
        excel_files: msg.excel_files ? {
          filename: msg.excel_files.filename,
          file_size: msg.excel_files.file_size
        } : null
      }));

      const nextCursor = messages.length === MESSAGES_PER_PAGE 
        ? messages[messages.length - 1]?.created_at 
        : null;

      return {
        messages,
        nextCursor
      };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    getPreviousPageParam: (firstPage) => firstPage?.nextCursor ?? undefined,
    enabled: true
  });

  const createSession = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

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
      return newSession;
    }
  });

  const sendMessage = useMutation({
    mutationFn: async ({ content, fileId, sessionId: currentSessionId }: { 
      content: string; 
      fileId?: string | null;
      sessionId?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (!currentSessionId) {
        throw new Error('No session ID provided');
      }

      console.log('Creating user message...');
      const { data: userMessage, error: userMessageError } = await supabase
        .from('chat_messages')
        .insert({
          content,
          role: 'user',
          session_id: currentSessionId,
          excel_file_id: fileId,
          is_ai_response: false,
          user_id: user.id,
          status: 'completed' as const,
          version: '1.0.0'
        })
        .select('*, excel_files(filename, file_size)')
        .single();

      if (userMessageError) throw userMessageError;

      console.log('Creating assistant message...');
      const { data: assistantMessage, error: assistantMessageError } = await supabase
        .from('chat_messages')
        .insert({
          content: '',
          role: 'assistant',
          session_id: currentSessionId,
          excel_file_id: fileId,
          is_ai_response: true,
          user_id: user.id,
          status: 'in_progress' as const,
          version: '1.0.0',
          deployment_id: crypto.randomUUID(),
          metadata: {
            processing_stage: {
              stage: 'generating',
              started_at: Date.now(),
              last_updated: Date.now()
            }
          }
        })
        .select('*, excel_files(filename, file_size)')
        .single();

      if (assistantMessageError) throw assistantMessageError;

      // Transform the messages to match our Message type
      const transformedUserMessage = {
        ...userMessage,
        role: 'user' as const,
        status: userMessage.status as Message['status'],
        excel_files: userMessage.excel_files ? {
          filename: userMessage.excel_files.filename,
          file_size: userMessage.excel_files.file_size
        } : null
      };

      const transformedAssistantMessage = {
        ...assistantMessage,
        role: 'assistant' as const,
        status: assistantMessage.status as Message['status'],
        excel_files: assistantMessage.excel_files ? {
          filename: assistantMessage.excel_files.filename,
          file_size: assistantMessage.excel_files.file_size
        } : null
      };

      return { 
        userMessage: transformedUserMessage, 
        assistantMessage: transformedAssistantMessage 
      };
    },
    onMutate: async ({ content, fileId, sessionId: currentSessionId }) => {
      await queryClient.cancelQueries({ queryKey: ['chat-messages', currentSessionId] });

      const previousMessages = queryClient.getQueryData(['chat-messages', currentSessionId]);

      const optimisticUserMessage: Message = {
        id: `temp-${Date.now()}`,
        content,
        role: 'user',
        session_id: currentSessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        excel_file_id: fileId,
        status: 'completed',
        is_ai_response: false,
        version: '1.0.0',
        excel_files: null,
        metadata: null,
      };

      const optimisticAssistantMessage: Message = {
        id: `temp-assistant-${Date.now()}`,
        content: '',
        role: 'assistant',
        session_id: currentSessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        excel_file_id: fileId,
        status: 'in_progress',
        is_ai_response: true,
        version: '1.0.0',
        deployment_id: crypto.randomUUID(),
        excel_files: null,
        metadata: {
          processing_stage: {
            stage: 'generating',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        },
      };

      queryClient.setQueryData(['chat-messages', currentSessionId], (old: any) => ({
        pages: [{
          messages: [optimisticAssistantMessage, optimisticUserMessage, ...(old?.pages?.[0]?.messages || [])],
          nextCursor: old?.pages?.[0]?.nextCursor
        },
        ...(old?.pages?.slice(1) || [])],
        pageParams: old?.pageParams || [null]
      }));

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['chat-messages', variables.sessionId], context.previousMessages);
      }
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    },
    onSuccess: async ({ userMessage, assistantMessage }, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['chat-messages', variables.sessionId] });
      
      generateAIResponse.mutate({
        content: variables.content,
        fileId: variables.fileId,
        sessionId: variables.sessionId!,
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

      console.log('Invoking excel-assistant function...');
      const { error: aiError } = await supabase.functions.invoke('excel-assistant', {
        body: {
          fileId,
          query: content,
          userId: user.id,
          sessionId: sessionId,
          threadId: null,
          messageId
        }
      });

      if (aiError) throw aiError;
      return { sessionId };
    },
    onError: (error) => {
      console.error('AI Response error:', error);
      toast({
        title: "Error",
        description: "Failed to generate AI response. Please try again.",
        variant: "destructive"
      });
    }
  });

  const messages = data?.pages?.flatMap(page => page.messages ?? []) ?? [];

  return {
    messages,
    isLoading,
    isError,
    createSession,
    sendMessage,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage
  };
}
