
import { useSession } from "./chat/useSession";
import { useMessageList } from "./chat/useMessageList";
import { useSendMessage } from "./chat/useSendMessage";
import { useMessageFormatting } from "./chat/useMessageFormatting";

export function useChatMessages(sessionId: string | null) {
  const { data: session, isLoading: sessionLoading } = useSession(sessionId);
  const { data: messages = [], isLoading: messagesLoading, isError, refetch } = useMessageList(sessionId);
  const sendMessage = useSendMessage(sessionId);
  const { formatTimestamp, groupMessagesByDate } = useMessageFormatting();

  return {
    messages,
    session,
    isLoading: sessionLoading || messagesLoading,
    isError,
    sendMessage,
    formatTimestamp,
    groupMessagesByDate,
    refetch
  };
}
