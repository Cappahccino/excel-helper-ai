import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MessagesResponse, Message } from "@/types/chat";
import { formatTimestamp, groupMessagesByDate } from "@/utils/dateFormatting";
import { fetchMessages } from "@/services/messageService";
import { useMessageMutation } from "./useMessageMutation";
import { useCallback, useState } from "react";

/**
 * Enhanced hook for managing chat messages with better pagination, 
 * error handling, and optimistic updates
 */
export function useChatMessages(sessionId: string | null) {
  const navigate = useNavigate();
  const [isRefetching, setIsRefetching] = useState(false);

  // Use infinite query for efficient pagination
  const {
    data,
    isLoading,
    isError,
    refetch: baseRefetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
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
    // Add staleTime for better caching
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!sessionId,
    // Add retry settings for better error recovery
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Get message mutation hooks
  const { sendMessage, createSession } = useMessageMutation(sessionId);

  // Enhanced refetch with loading state
  const refetch = useCallback(async () => {
    if (sessionId) {
      setIsRefetching(true);
      try {
        await baseRefetch();
      } finally {
        setIsRefetching(false);
      }
    }
  }, [sessionId, baseRefetch]);

  // Combine all pages of messages
  const messages = (data?.pages ?? []).flatMap(page => page.messages);

  // Add search functionality to the messages
  const searchMessages = useCallback((searchTerm: string): Message[] => {
    if (!searchTerm.trim()) return messages;
    
    const normalizedSearchTerm = searchTerm.toLowerCase().trim();
    return messages.filter(message => 
      message.content.toLowerCase().includes(normalizedSearchTerm)
    );
  }, [messages]);

  // Add message deletion capability
  const deleteMessage = useCallback(async (messageId: string) => {
    // Implement optimistic UI updates
    // This would need to be connected to a deletion mutation
    console.log(`Deleting message ${messageId}`);
    // For now, just return the current messages excluding the deleted one
    return messages.filter(msg => msg.id !== messageId);
  }, [messages]);

  return {
    messages,
    isLoading: isLoading || isRefetching,
    isError,
    createSession,
    sendMessage,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    searchMessages,
    deleteMessage
  };
}
