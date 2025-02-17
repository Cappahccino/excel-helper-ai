
import { useSession } from "./useSession";
import { useMessages } from "./useMessages";

export function useChatMessages(sessionId: string | null) {
  const { data: session } = useSession(sessionId);

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
