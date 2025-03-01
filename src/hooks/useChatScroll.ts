
import { useState, useRef, useEffect, RefObject, useCallback } from "react";
import { Message } from "@/types/chat";

interface UseChatScrollProps {
  messages: Message[];
  messagesEndRef: RefObject<HTMLDivElement>;
  chatContainerRef: RefObject<HTMLDivElement>;
  threshold?: number; // Threshold in pixels for determining "at bottom"
  smoothScroll?: boolean;
}

export function useChatScroll({ 
  messages, 
  messagesEndRef, 
  chatContainerRef,
  threshold = 100,
  smoothScroll = true
}: UseChatScrollProps) {
  // Track scroll position and state
  const [hasScrolledUp, setHasScrolledUp] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [lastScrollHeight, setLastScrollHeight] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  
  // Refs for state preservation and event handling
  const scrollPositionRef = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageCountRef = useRef(messages.length);
  const lastScrollTopRef = useRef(0);
  const autoScrollEnabledRef = useRef(true);
  
  // Helper to find the ScrollArea viewport element
  const getViewportElement = useCallback((): HTMLElement | null => {
    if (!chatContainerRef.current) return null;
    const viewport = chatContainerRef.current.querySelector('[data-radix-scroll-area-viewport]');
    return viewport as HTMLElement;
  }, [chatContainerRef]);

  // Function to scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = getViewportElement();
    if (!viewport) return;
    
    try {
      setIsScrolling(true);
      
      // Use scrollHeight to ensure we scroll to the actual bottom
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: smoothScroll ? behavior : 'auto'
      });
      
      // Store last scroll height for comparison
      setLastScrollHeight(viewport.scrollHeight);
      
      // Reset unread message count when manually scrolling to bottom
      setUnreadMessageCount(0);
      autoScrollEnabledRef.current = true;
    } catch (error) {
      console.error("Error in scrollToBottom:", error);
    } finally {
      // Clear any existing scroll timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Set timeout to release the scrolling lock
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 200);
    }
  }, [getViewportElement, smoothScroll]);

  // Function to scroll to a specific message by ID
  const scrollToMessage = useCallback((messageId: string) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({
        behavior: smoothScroll ? 'smooth' : 'auto',
        block: 'start'
      });
    }
  }, [smoothScroll]);

  // Modified function to handle scroll events with the correct React UIEvent type
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (isScrolling) return;
    
    const viewport = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    
    // Store current scroll position for use in useEffect
    scrollPositionRef.current = scrollTop;
    
    // Determine if user has scrolled up
    const isAtBottom = (scrollHeight - scrollTop - clientHeight) <= threshold;
    setHasScrolledUp(!isAtBottom);
    
    // Update auto-scroll behavior based on user's scrolling
    if (isAtBottom) {
      autoScrollEnabledRef.current = true;
      setUnreadMessageCount(0); // Reset unread count when user scrolls to bottom
    } else if (scrollTop < lastScrollTopRef.current) {
      // User is scrolling up intentionally
      autoScrollEnabledRef.current = false;
    }
    
    // Store last scroll top for direction detection
    lastScrollTopRef.current = scrollTop;
  }, [isScrolling, threshold]);

  // Set up scroll event listeners - this is no longer needed as we're using the onScroll prop
  useEffect(() => {
    // No need to add event listeners manually when using the onScroll prop
    return () => {
      // Cleanup any timeouts when unmounting
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Handle initial scroll and new messages
  useEffect(() => {
    // Check if there are new messages
    const newMessageCount = messages.length - lastMessageCountRef.current;
    
    // Only auto-scroll if we're at the bottom or this is the initial load
    if (
      (autoScrollEnabledRef.current && !hasScrolledUp) || 
      messages.length <= 5 || // Likely initial load
      lastMessageCountRef.current === 0 // First load
    ) {
      scrollToBottom(lastMessageCountRef.current === 0 ? 'auto' : 'smooth');
    } else if (newMessageCount > 0) {
      // Increment unread count if we're not scrolling and new messages arrived
      setUnreadMessageCount(prev => prev + newMessageCount);
    }
    
    // Update ref for next comparison
    lastMessageCountRef.current = messages.length;
  }, [messages.length, hasScrolledUp, scrollToBottom]);

  // Function to resume auto-scrolling
  const resumeAutoScroll = useCallback(() => {
    autoScrollEnabledRef.current = true;
    scrollToBottom();
  }, [scrollToBottom]);

  return {
    hasScrolledUp,
    isScrolling,
    unreadMessageCount,
    scrollToBottom,
    scrollToMessage,
    handleScroll,
    resumeAutoScroll
  };
}
