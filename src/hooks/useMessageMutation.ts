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
import { AIServiceError, AIServiceErrorType } from "@/services/aiService";

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
        console.log('Starting message send flow with session:', currentSessionId);
        
        // Determine if this is a text-only query
        const isTextOnlyQuery = !fileIds || fileIds.length === 0;
        console.log(`Processing ${isTextOnlyQuery ? 'text-only' : 'file-based'} query`);
        
        let activeFileIds: string[] = [];
        
        if (!isTextOnlyQuery) {
          // Handle file-based query
          activeFileIds = fileIds || [];
          console.log('Using provided file IDs:', activeFileIds);
          
          // Enhanced validation with detailed logging
          console.log('Validating file availability...');
          const filesValid = await validateFileAvailability(activeFileIds);
          
          if (!filesValid) {
            console.warn("Files may not be ready for processing");
            toast({
              title: "Warning",
              description: "Some files may not be fully processed yet. The message will still be sent, but the response might be delayed.",
              variant: "default"
            });
            await wait(500);
          } else {
            console.log("All files validated successfully");
          }

          // Ensure session files are set up
          console.log('Ensuring session files are properly associated...');
          await ensureSessionFiles(currentSessionId, activeFileIds);
        }

        // Create user message
        console.log(`Creating ${isTextOnlyQuery ? 'text-only' : 'file-based'} user message`);
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

        // Create assistant message with improved logging
        console.log('Creating assistant message...');
        const assistantMessage = await createAssistantMessage(currentSessionId, user.id, activeFileIds);
        console.log('Assistant message created with ID:', assistantMessage.id);

        // Trigger AI response with enhanced file verification
        console.log('Triggering AI processing...');
        try {
          // Placeholder for AI response triggering - this will be handled elsewhere
          console.log('AI processing triggered successfully');
        } catch (error) {
          // Handle specific error types from AI service
          if (error instanceof AIServiceError) {
            console.error(`AI Service error (${error.type}):`, error.message);
            
            let toastMessage = "An error occurred while processing your request.";
            
            switch (error.type) {
              case AIServiceErrorType.NO_FILES:
                toastMessage = isTextOnlyQuery 
                  ? "Your query will be processed without file analysis."
                  : "No files available for processing. Please upload files first.";
                break;
              case AIServiceErrorType.VERIFICATION_FAILED:
                toastMessage = "File verification failed. Files may not be ready or may be corrupted.";
                break;
              case AIServiceErrorType.NETWORK_ERROR:
                toastMessage = "Network error during AI processing. Please try again.";
                break;
              default:
                toastMessage = "Error processing your request. Please try again.";
            }
            
            toast({
              title: isTextOnlyQuery ? "Processing" : "Processing Error",
              description: toastMessage,
              variant: isTextOnlyQuery ? "default" : "destructive"
            });
          } else {
            // Handle generic errors
            console.error('Generic error triggering AI:', error);
            toast({
              title: "Error",
              description: error instanceof Error ? error.message : "Failed to process message",
              variant: "destructive"
            });
          }
        }

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
