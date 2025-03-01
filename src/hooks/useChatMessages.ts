import { useState } from "react";
import { Message } from "@/types/chat";
import { useQueryClient } from "@tanstack/react-query";

// Add to your existing useChatMessages hook
export function useChatMessages(sessionId: string | null) {
  const [optimisticMessage, setOptimisticMessage] = useState<Message | null>(null);
  const queryClient = useQueryClient();

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, fileIds, tagNames, sessionId: currentSessionId }) => {
      // Create optimistic message
      const tempMessage: Message = {
        id: 'optimistic-' + Date.now(),
        content,
        role: 'user',
        session_id: currentSessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'completed',
        is_ai_response: false,
        version: '1.0.0',
        metadata: null
      };

      // Set optimistic message
      setOptimisticMessage(tempMessage);

      try {
        // Your existing message sending logic
        const result = await sendMessageToBackend(content, fileIds, tagNames, currentSessionId);
        
        // Clear optimistic message after successful send
        setOptimisticMessage(null);
        
        return result;
      } catch (error) {
        // Clear optimistic message on error
        setOptimisticMessage(null);
        throw error;
      }
    },
    onError: (error) => {
      // Clear optimistic message on error
      setOptimisticMessage(null);
      // Your existing error handling
    }
  });

  // Combine real messages with optimistic message
  const allMessages = optimisticMessage
    ? [...messages, optimisticMessage]
    : messages;

  return {
    messages: allMessages,
    isLoading,
    sendMessage: sendMessageMutation,
    createSession,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage,
    optimisticMessage
  };
}
