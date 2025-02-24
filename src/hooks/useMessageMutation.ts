
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Message, MessagesResponse } from "@/types/chat";
import { useToast } from "@/hooks/use-toast";
import { createUserMessage, createAssistantMessage } from "@/services/messageService";
import { getFilesWithRetry } from "@/services/fileOperations";
import { wait } from "@/utils/retryUtils";
import { InfiniteData } from "@tanstack/react-query";

export function useMessageMutation(sessionId: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
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
        // If fileIds provided, use them directly. Otherwise, try to get active session files
        let activeFileIds = fileIds;
        if (!activeFileIds || activeFileIds.length === 0) {
          console.log('No files provided, fetching active session files...');
          activeFileIds = await getFilesWithRetry(currentSessionId);
        }

        // Ensure we have files before proceeding
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

        // Wait a short moment for session_files to be created
        await wait(500);

        console.log('Creating assistant message...');
        const assistantMessage = await createAssistantMessage(currentSessionId, user.id, activeFileIds);

        // Ensure we still have the files before triggering AI response
        const verifiedFileIds = await getFilesWithRetry(currentSessionId);
        console.log('Verified files before AI response:', verifiedFileIds);

        // Immediately trigger the AI response
        console.log('Triggering AI response for message:', assistantMessage.id);
        const aiResponse = await supabase.functions.invoke('excel-assistant', {
          body: {
            fileIds: verifiedFileIds,
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

  return {
    sendMessage: mutation.mutate,
    createSession: async () => {
      // This is a placeholder since createSession isn't implemented
      // You should implement this if needed or remove it if not used
      return null;
    }
  };
}
