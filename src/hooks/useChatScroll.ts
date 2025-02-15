
import { useState, useRef, useEffect, RefObject } from "react";

interface UseChatScrollProps {
  messages: any[];
  messagesEndRef: RefObject<HTMLDivElement>;
  chatContainerRef: RefObject<HTMLDivElement>;
}

export function useChatScroll({ messages, messagesEndRef, chatContainerRef }: UseChatScrollProps) {
  const [hasScrolledUp, setHasScrolledUp] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  };

  const handleScroll = () => {
    const chatContainer = chatContainerRef.current;
    if (!chatContainer) return;

    const { scrollTop, scrollHeight, clientHeight } = chatContainer;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setHasScrolledUp(!isAtBottom);
  };

  useEffect(() => {
    if (!hasScrolledUp) {
      scrollToBottom();
    }
  }, [messages, hasScrolledUp]);

  useEffect(() => {
    scrollToBottom("auto");
  }, []);

  return {
    hasScrolledUp,
    setHasScrolledUp,
    scrollToBottom,
    handleScroll
  };
}
