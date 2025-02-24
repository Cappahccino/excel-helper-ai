
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

  const sendMessageMutation = useMutation({
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
        let activeFileIds = fileIds;
        if (!activeFileIds || activeFileIds.length === 0) {
          console.log('No files provided, fetching active session files...');
          activeFileIds = await getFilesWithRetry(currentSessionId);
        }

        if (!activeFileIds || activeFileIds.length === 0) {
          console.error('No files available for the message');
          throw new Error('No files available for the message');
        }

        console.log('Creating user message with files:', activeFileIds);
        const userMessage = await createUserMessage(content, currentSessionId, user.id, activeFileIds);

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

        await wait(500);

        console.log('Creating assistant message...');
        const assistantMessage = await createAssistantMessage(currentSessionId, user.id, activeFileIds);

        const verifiedFileIds = await getFilesWithRetry(currentSessionId);
        console.log('Verified files before AI response:', verifiedFileIds);

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
    }
  });

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: session, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          status: 'active',
          chat_name: 'Untitled Chat',
          thread_level: 0,
          thread_position: 0,
          thread_metadata: {
            title: null,
            summary: null
          }
        })
        .select('session_id')
        .single();

      if (error) {
        console.error('Error creating session:', error);
        throw error;
      }

      if (!session) {
        throw new Error('Failed to create session');
      }

      return session;
    },
    onError: (error) => {
      console.error('Session creation error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create chat session",
        variant: "destructive"
      });
    }
  });

  return {
    sendMessage: {
      mutate: sendMessageMutation.mutate,
      mutateAsync: sendMessageMutation.mutateAsync
    },
    createSession: {
      mutateAsync: createSessionMutation.mutateAsync
    }
  };
}
