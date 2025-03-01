import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Message, MessageStatus } from "@/types/chat";
import { MessageGroup } from "./MessageGroup";
import { LoadingMessages } from "./LoadingMessages";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ChevronDown, Search, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatContentProps {
  messages: Message[];
  isLoading: boolean;
  formatTimestamp: (timestamp: string) => string;
  groupMessagesByDate: (messages: Message[]) => Record<string, Message[]>;
  latestMessageId: string | null;
  status: MessageStatus;
  onScrollToBottom?: () => void;
  onMessageDelete?: (messageId: string) => Promise<void>;
  onMessageEdit?: (messageId: string, content: string) => Promise<void>;
}

export function ChatContent({
  messages,
  isLoading,
  formatTimestamp,
  groupMessagesByDate,
  latestMessageId,
  status,
  onScrollToBottom,
  onMessageDelete,
  onMessageEdit
}: ChatContentProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [filteredMessages, setFilteredMessages] = useState<Message[]>(messages);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [filterOptions, setFilterOptions] = useState({
    showUserMessages: true,
    showAssistantMessages: true,
  });

  // Scroll to a specific message
  const scrollToMessage = useCallback((messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Highlight the message briefly
      setHighlightedMessageId(messageId);
      setTimeout(() => {
        setHighlightedMessageId(null);
      }, 2000);
    }
  }, []);

  // Handle search term changes
  useEffect(() => {
    if (!searchTerm.trim()) {
      // Reset to full message list when search is empty
      setFilteredMessages(messages);
      setSearchResults([]);
      return;
    }
    
    // Filter messages based on search term and filter options
    const filtered = messages.filter(message => {
      // Apply role filters
      if (message.role === 'user' && !filterOptions.showUserMessages) return false;
      if (message.role === 'assistant' && !filterOptions.showAssistantMessages) return false;
      
      // Apply search term
      return message.content.toLowerCase().includes(searchTerm.toLowerCase());
    });
    
    setFilteredMessages(filtered);
    
    // Collect IDs of messages that match search term for navigation
    const matchingIds = filtered.map(msg => msg.id);
    setSearchResults(matchingIds);
    
    // Reset search index when results change
    setSearchResultIndex(matchingIds.length > 0 ? 0 : -1);
    
    // Scroll to first result if available
    if (matchingIds.length > 0) {
      scrollToMessage(matchingIds[0]);
    }
  }, [searchTerm, messages, filterOptions, scrollToMessage]);

  // Automatically scroll down on new messages
  useEffect(() => {
    if (!scrollAreaRef.current || !showScrollButton) return;
    
    const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollElement) {
      const { scrollHeight, clientHeight, scrollTop } = scrollElement as HTMLElement;
      // Only auto-scroll if we're already near bottom
      if (scrollHeight - scrollTop - clientHeight < 100) {
        scrollElement.scrollTop = scrollHeight;
      }
    }
  }, [messages.length, showScrollButton]);

  // Scroll to bottom handler
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (onScrollToBottom) {
      onScrollToBottom();
      return;
    }
    
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior
      });
    }
  };

  // Scroll event handler to show/hide scroll button
  const handleScroll = () => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (!viewport) return;

    const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  };

  // Navigation through search results
  const navigateSearchResults = (direction: 'next' | 'prev') => {
    if (searchResults.length === 0) return;
    
    let newIndex = searchResultIndex;
    if (direction === 'next') {
      newIndex = (searchResultIndex + 1) % searchResults.length;
    } else {
      newIndex = (searchResultIndex - 1 + searchResults.length) % searchResults.length;
    }
    
    setSearchResultIndex(newIndex);
    scrollToMessage(searchResults[newIndex]);
  };

  // Process messages into groups by date
  const messageGroups = groupMessagesByDate(filteredMessages);
  const hasMessages = Object.keys(messageGroups).length > 0;

  // Setup scroll event listener
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (!viewport) return;

    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  // Close search handler
  const closeSearch = () => {
    setShowSearch(false);
    setSearchTerm("");
    setFilteredMessages(messages);
  };

  return (
    <div className="relative flex-grow">
      {/* Search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 right-0 z-10 bg-white/90 backdrop-blur-sm border-b p-2 flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search messages..."
                className="pl-8 pr-16"
                autoFocus
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchResults.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {searchResultIndex + 1}/{searchResults.length}
                  </span>
                )}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6" 
                  onClick={() => navigateSearchResults('prev')}
                  disabled={searchResults.length === 0}
                >
                  <ChevronDown className="h-4 w-4 rotate-180" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6" 
                  onClick={() => navigateSearchResults('next')}
                  disabled={searchResults.length === 0}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <Filter className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={filterOptions.showUserMessages}
                  onCheckedChange={(checked) => 
                    setFilterOptions(prev => ({ ...prev, showUserMessages: !!checked }))
                  }
                >
                  Show my messages
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterOptions.showAssistantMessages}
                  onCheckedChange={(checked) => 
                    setFilterOptions(prev => ({ ...prev, showAssistantMessages: !!checked }))
                  }
                >
                  Show assistant messages
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={closeSearch}>
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <ScrollArea 
        ref={scrollAreaRef} 
        className={cn(
          "h-full p-4 md:p-6",
          "scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent",
          showSearch && "pt-14"
        )}
      >
        <div className="space-y-8">
          {(!hasMessages && isLoading) ? (
            <LoadingMessages />
          ) : (
            <AnimatePresence initial={false}>
              {Object.entries(messageGroups).map(([date, groupMessages]) => (
                <MessageGroup
                  key={date}
                  date={date}
                  messages={groupMessages}
                  formatTimestamp={formatTimestamp}
                  latestMessageId={latestMessageId}
                  status={status}
                  highlightedMessageId={highlightedMessageId}
                  searchTerm={searchTerm}
                  onMessageDelete={onMessageDelete}
                  onMessageEdit={onMessageEdit}
                />
              ))}
              <div ref={messagesEndRef} />
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
      
      {/* Action buttons */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        {!showSearch && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="rounded-full shadow-lg bg-white hover:bg-gray-100"
                  onClick={() => setShowSearch(true)}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Search messages
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {showScrollButton && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="rounded-full shadow-lg bg-white hover:bg-gray-100"
                  onClick={() => scrollToBottom()}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Scroll to bottom
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
