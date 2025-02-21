import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Message, MessagesResponse } from "@/types/chat";
import { formatTimestamp, groupMessagesByDate } from "@/utils/dateFormatting";
import { useToast } from "@/hooks/use-toast";
import { fetchMessages, createUserMessage, createAssistantMessage } from "@/services/messageService";
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
        let tags: Tag[] = [];
        if (tagNames && tagNames.length > 0) {
          console.log('Processing tags:', tagNames);
          
          // First, get existing tags
          const { data: existingTags, error: existingTagsError } = await supabase
            .from('file_tags')
            .select('*')
            .in('name', tagNames.map(name => name.toLowerCase()));

          if (existingTagsError) {
            console.error('Error fetching existing tags:', existingTagsError);
            throw existingTagsError;
          }

          const existingTagNames = new Set(existingTags?.map(t => t.name.toLowerCase()) || []);
          const newTagNames = tagNames.filter(name => 
            !existingTagNames.has(name.toLowerCase())
          );

          if (newTagNames.length > 0) {
            console.log('Creating new tags:', newTagNames);
            
            const newTagsToCreate = newTagNames.map(name => ({
              name: name.toLowerCase(),
              type: 'custom' as const,
              user_id: user.id
            }));

            const { data: newTags, error: createError } = await supabase
              .from('file_tags')
              .insert(newTagsToCreate)
              .select();

            if (createError) {
              console.error('Error creating new tags:', createError);
              throw createError;
            }

            console.log('New tags created:', newTags);
            tags = [...(existingTags || []), ...(newTags || [])];
          } else {
            tags = existingTags || [];
          }
        }

        console.log('Creating user message...');
        const userMessage = await createUserMessage(content, currentSessionId, user.id, fileIds);

        if (tags.length > 0 && fileIds && fileIds.length > 0) {
          console.log('Creating message file tags associations...');
          
          const messageTags = tags.flatMap(tag => 
            fileIds.map(fileId => ({
              message_id: userMessage.id,
              file_id: fileId,
              tag_id: tag.id,
              ai_context: null
            }))
          );

          const { error: tagError } = await supabase
            .from('message_file_tags')
            .insert(messageTags);

          if (tagError) {
            console.error('Error creating message file tags:', tagError);
            toast({
              title: "Note",
              description: "Message sent, but there was an issue with tag associations.",
              variant: "default"
            });
          } else {
            console.log('Message file tags created successfully');
          }
        }

        console.log('Creating assistant message...');
        const assistantMessage = await createAssistantMessage(currentSessionId, user.id, fileIds);

        return { userMessage, assistantMessage, tags };
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
    onSuccess: async ({ userMessage, assistantMessage, tags }, variables) => {
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
      
      generateAIResponse.mutate({
        content: variables.content,
        fileIds: variables.fileIds,
        sessionId: variables.sessionId!,
        messageId: assistantMessage.id,
        tags: tags
      });
    }
  });

  const generateAIResponse = useMutation({
    mutationFn: async ({ 
      content, 
      fileIds, 
      sessionId, 
      messageId,
      tags 
    }: { 
      content: string; 
      fileIds?: string[] | null; 
      sessionId: string;
      messageId: string;
      tags?: Tag[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      console.log('Invoking excel-assistant function with tags:', tags);
      const { error: aiError } = await supabase.functions.invoke('excel-assistant', {
        body: {
          fileIds,
          query: content,
          userId: user.id,
          sessionId: sessionId,
          threadId: null,
          messageId,
          tags: tags?.map(tag => ({ id: tag.id, name: tag.name }))
        }
      });

      if (aiError) {
        console.error('AI Response error:', aiError);
        throw aiError;
      }
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
