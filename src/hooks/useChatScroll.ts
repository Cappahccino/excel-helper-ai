
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
      // Find the ScrollArea Viewport element
      const viewport = chatContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        // Use scrollHeight to ensure we scroll to the absolute bottom
        const viewportElement = viewport as HTMLElement;
        viewportElement.scrollTop = viewportElement.scrollHeight;
      }
    }
  };

  const handleScroll = () => {
    // Get the ScrollArea Viewport element
    const viewport = chatContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;

    // Calculate scroll position using the viewport element
    const { scrollTop, scrollHeight, clientHeight } = viewport as HTMLElement;
    const isAtBottom = (scrollHeight - scrollTop) <= (clientHeight + 1);
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
