
import { useSession } from "./useSession";
import { useMessages } from "./useMessages";
import { useEffect, useCallback } from "react";

export function useChatMessages(sessionId: string | null) {
  const { data: session, isLoading: sessionLoading } = useSession(sessionId);

  const {
    messages,
    isLoading: messagesLoading,
    isError,
    sendMessage,
    createSession,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage
  } = useMessages(sessionId);

  const handleRefetch = useCallback(async () => {
    if (sessionId) {
      await refetch();
    }
  }, [sessionId, refetch]);

  // Force refresh when session changes or new messages arrive
  useEffect(() => {
    handleRefetch();
  }, [handleRefetch]);

  return {
    messages,
    session,
    isLoading: sessionLoading || messagesLoading,
    isError,
    sendMessage,
    createSession,
    formatTimestamp,
    groupMessagesByDate,
    refetch: handleRefetch,
    hasNextPage,
    fetchNextPage
  };
}
