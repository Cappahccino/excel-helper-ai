
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MessagesResponse } from "@/types/chat";
import { useToast } from "@/hooks/use-toast";
import { createUserMessage, createAssistantMessage } from "@/services/messageService";
import { getFilesWithRetry, validateFileAvailability } from "@/services/fileOperations";
import { wait } from "@/utils/retryUtils";
import { InfiniteData } from "@tanstack/react-query";
import { createSession, ensureSessionFiles } from "@/services/sessionService";
import { processMessageTags } from "@/services/tagOperations";
import { triggerAIResponse } from "@/services/aiService";

type MutationContext = {
  previousMessages?: InfiniteData<MessagesResponse>;
};

export function useMessageMutation(sessionId: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      return createSession(user.id);
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
        // Get files - simplified approach
        let activeFileIds = fileIds;
        if (!activeFileIds || activeFileIds.length === 0) {
          console.log('No files provided, fetching active session files...');
          activeFileIds = await getFilesWithRetry(currentSessionId);
        }

        if (!activeFileIds || activeFileIds.length === 0) {
          throw new Error('No files available for the message');
        }

        // Basic validation - simplified
        const filesValid = await validateFileAvailability(activeFileIds);
        if (!filesValid) {
          console.warn("Files may not be fully processed, but will attempt to continue");
          await wait(500);
        }

        // Ensure session files are set up
        await ensureSessionFiles(currentSessionId, activeFileIds);

        // Create user message
        console.log('Creating user message with files:', activeFileIds);
        const userMessage = await createUserMessage(content, currentSessionId, user.id, activeFileIds);

        // Process tags if provided
        if (tagNames && tagNames.length > 0) {
          const tagResult = await processMessageTags(userMessage.id, activeFileIds, tagNames, user.id);
          
          if (!tagResult.success) {
            toast({
              title: "Warning",
              description: "Some tags failed to process. The message will still be sent.",
              variant: "destructive"
            });
          } else if (tagResult.hasErrors) {
            toast({
              title: "Warning",
              description: `${tagResult.successCount} tags processed successfully, ${tagResult.errorCount} failed`,
              variant: "default"
            });
          } else {
            toast({
              title: "Success",
              description: `All ${tagResult.successCount} tags processed successfully`,
              variant: "default"
            });
          }
        }

        await wait(300);

        // Create assistant message - simplified flow
        console.log('Creating assistant message...');
        const assistantMessage = await createAssistantMessage(currentSessionId, user.id, activeFileIds);

        // Trigger AI response - no extra verification needed
        await triggerAIResponse({
          fileIds: activeFileIds,
          query: content,
          userId: user.id,
          sessionId: currentSessionId,
          messageId: assistantMessage.id
        });

        return { userMessage, assistantMessage };
      } catch (error) {
        console.error('Error in sendMessage:', error);
        throw error;
      }
    },
    onError: (err, variables, context: MutationContext) => {
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
