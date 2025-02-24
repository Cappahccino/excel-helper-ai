import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Message, MessagesResponse } from "@/types/chat";
import { formatTimestamp, groupMessagesByDate } from "@/utils/dateFormatting";
import { useToast } from "@/hooks/use-toast";
import { fetchMessages, createUserMessage, createAssistantMessage } from "@/services/messageService";
import { getActiveSessionFiles } from "@/services/sessionFileService";
import { InfiniteData } from "@tanstack/react-query";
import { Tag } from "@/types/tags";

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
  } = useInfiniteQuery<MessagesResponse, Error>({
    queryKey: ['chat-messages', sessionId],
    queryFn: async ({ pageParam }) => {
      if (!sessionId) {
        return {
          messages: [],
          nextCursor: null
        };
      }
      
      const messages = await fetchMessages(sessionId, pageParam as string | null);
      const nextCursor = messages.length === 50 
        ? messages[messages.length - 1]?.created_at 
        : null;

      return {
        messages,
        nextCursor
      };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    getPreviousPageParam: (firstPage) => firstPage.nextCursor ?? undefined,
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
    mutationFn: async ({ 
      content, 
      fileIds,
      tagNames,
      sessionId: currentSessionId 
    }: { 
      content: string;
      fileIds?: string[] | null;
      tagNames?: string[] | null;
      sessionId?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (!currentSessionId) {
        throw new Error('No session ID provided');
      }

      try {
        // If no fileIds provided, get active session files
        let activeFileIds = fileIds;
        if (!activeFileIds || activeFileIds.length === 0) {
          console.log('No files provided, fetching active session files...');
          const sessionFiles = await getActiveSessionFiles(currentSessionId);
          activeFileIds = sessionFiles.map(sf => sf.file_id);
          console.log('Found active session files:', activeFileIds);
        }

        if (!activeFileIds || activeFileIds.length === 0) {
          console.error('No files available for the message');
          throw new Error('No files available for the message');
        }

        console.log('Creating user message with files:', activeFileIds);
        const userMessage = await createUserMessage(content, currentSessionId, user.id, activeFileIds);

        // Process tags if they exist and we have files
        if (tagNames && tagNames.length > 0 && activeFileIds && activeFileIds.length > 0) {
          console.log('Processing tags:', tagNames);
          
          const { data, error } = await supabase.functions.invoke('tag-operations', {
            body: {
              messageId: userMessage.id,
              fileIds: activeFileIds,
              tagNames,
              userId: user.id
            }
          });

          if (error) {
            console.error('Error processing tags:', error);
            toast({
              title: "Warning",
              description: "Some tags failed to process. The message will still be sent.",
              variant: "destructive"
            });
          } else {
            if (data.errors && data.errors.length > 0) {
              console.warn('Some tags failed to process:', data.errors);
              toast({
                title: "Warning",
                description: `${data.results.length} tags processed successfully, ${data.errors.length} failed`,
                variant: "default"
              });
            } else {
              toast({
                title: "Success",
                description: `All ${data.results.length} tags processed successfully`,
                variant: "default"
              });
            }
          }
        }

        console.log('Creating assistant message...');
        const assistantMessage = await createAssistantMessage(currentSessionId, user.id, activeFileIds);

        // Immediately trigger the AI response
        console.log('Triggering AI response for message:', assistantMessage.id);
        const aiResponse = await supabase.functions.invoke('excel-assistant', {
          body: {
            fileIds: activeFileIds,
            query: content,
            userId: user.id,
            sessionId: currentSessionId,
            threadId: null,
            messageId: assistantMessage.id
          }
        });

        if (aiResponse.error) {
          console.error('Error triggering AI response:', aiResponse.error);
          throw aiResponse.error;
        }

        return { userMessage, assistantMessage };
      } catch (error) {
        console.error('Error in sendMessage:', error);
        throw error;
      }
    },
    onMutate: async ({ content, fileIds, tagNames, sessionId: currentSessionId }) => {
      await queryClient.cancelQueries({ queryKey: ['chat-messages', currentSessionId] });

      const previousMessages = queryClient.getQueryData<InfiniteData<MessagesResponse>>(['chat-messages', currentSessionId]);

      const optimisticUserMessage: Message = {
        id: `temp-${Date.now()}`,
        content,
        role: 'user',
        session_id: currentSessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        excel_file_id: fileIds?.[0] || null,
        status: 'completed',
        is_ai_response: false,
        version: '1.0.0',
        excel_files: null,
        metadata: null,
        message_files: fileIds?.map(fileId => ({
          file_id: fileId,
          role: 'user'
        }))
      };

      queryClient.setQueryData<InfiniteData<MessagesResponse>>(['chat-messages', currentSessionId], (old) => ({
        pages: [{
          messages: [...(old?.pages?.[0]?.messages || []), optimisticUserMessage],
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
      console.error('Send message error:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to send message",
        variant: "destructive"
      });
    },
    onSuccess: async ({ userMessage, assistantMessage }, variables) => {
      queryClient.setQueryData<InfiniteData<MessagesResponse>>(['chat-messages', variables.sessionId], (old) => {
        if (!old?.pages?.[0]) return old;
        
        return {
          pages: [{
            messages: [...old.pages[0].messages, assistantMessage],
            nextCursor: old.pages[0].nextCursor
          },
          ...(old.pages.slice(1) || [])],
          pageParams: old.pageParams
        };
      });
      
      await queryClient.invalidateQueries({ queryKey: ['chat-messages', variables.sessionId] });
    }
  });

  const messages = (data?.pages ?? []).flatMap(page => page.messages);

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
