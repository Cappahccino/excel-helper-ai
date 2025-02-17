
import { useSession } from "./useSession";
import { useMessages } from "./useMessages";
import { useEffect } from "react";

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

  // Force refresh when session changes or new messages arrive
  useEffect(() => {
    if (sessionId) {
      refetch();
    }
  }, [sessionId, refetch]);

  return {
    messages,
    session,
    isLoading: sessionLoading || messagesLoading,
    isError,
    sendMessage,
    createSession,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage
  };
}
