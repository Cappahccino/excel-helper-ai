
import { useSession } from "./useSession";
import { useMessages } from "./useMessages";

export function useChatMessages(sessionId: string | null) {
  const { data: session, isLoading: sessionLoading } = useSession(sessionId);

  const {
    messages,
    isLoading: messagesLoading,
    isError,
    sendMessage,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage
  } = useMessages(sessionId);

  return {
    messages,
    session,
    isLoading: sessionLoading || messagesLoading,
    isError,
    sendMessage,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage
  };
}
