
import { useSession } from "./useSession";
import { useMessages } from "./useMessages";

export function useChatMessages(sessionId: string | null) {
  const { data: sessionData } = useSession(sessionId);
  const session = sessionData?.pages?.[0];

  const {
    messages,
    isLoading,
    isError,
    sendMessage,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage
  } = useMessages(sessionId, session);

  return {
    messages,
    session,
    isLoading,
    isError,
    sendMessage,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage
  };
}
