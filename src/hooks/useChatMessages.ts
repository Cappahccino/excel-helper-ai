
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MessagesResponse, Message, MessageType, MessagePin, MessageStatus } from "@/types/chat";
import { formatTimestamp, groupMessagesByDate } from "@/utils/dateFormatting";
import {
  fetchMessages,
  deleteMessage as deleteMessageService,
  editMessage as editMessageService,
  pinMessage as pinMessageService,
  unpinMessage as unpinMessageService
} from "@/services/messageService";
import { useMessageMutation } from "./useMessageMutation";
import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { toast } from "@/components/ui/use-toast";
import { debounce } from "lodash";
import { highlightSearchTerms } from "@/utils/searchUtils";
import { supabase } from "@/integrations/supabase/client";

export enum MessageFilterType {
  ALL = 'all',
  QUERY = 'query',
  ANALYSIS = 'analysis',
  ERROR = 'error',
  PINNED = 'pinned'
}

interface MessageQueryParams {
  sessionId: string | null;
  pageSize?: number;
  filter?: MessageFilterType;
  searchTerm?: string;
  includeFileContent?: boolean;
}

interface UseChatMessagesOptions {
  enableRealtime?: boolean;
  defaultPageSize?: number;
  selectFields?: string[];
}

/**
 * Enhanced hook for managing chat messages with better pagination,
 * advanced filtering, searching, editing, and pinning capabilities
 */
export function useChatMessages(
  sessionId: string | null,
  options: UseChatMessagesOptions = {}
) {
  const {
    enableRealtime = true,
    defaultPageSize = 20,
    selectFields = ['*', 'message_files(*)', 'message_reactions(*)']
  } = options;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const subscriptionRef = useRef<any>(null);

  // State for additional features
  const [isRefetching, setIsRefetching] = useState(false);
  const [filter, setFilter] = useState<MessageFilterType>(MessageFilterType.ALL);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [includeFileContent, setIncludeFileContent] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [pinnedMessages, setPinnedMessages] = useState<MessagePin[]>([]);
  const [semanticResults, setSemanticResults] = useState<string[]>([]);
  const [isLoadingPins, setIsLoadingPins] = useState<boolean>(false);
  const [lastScrollPosition, setLastScrollPosition] = useState<number>(0);

  // Create a ref to store the original messages for filtering
  const allMessagesRef = useRef<Message[]>([]);

  // Enhanced infinite query with cursor-based pagination and filtering
  const {
    data,
    isLoading,
    isError,
    error,
    refetch: baseRefetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
  } = useInfiniteQuery<MessagesResponse, Error>({
    queryKey: ['chat-messages', sessionId, filter, searchTerm, includeFileContent, defaultPageSize],
    queryFn: async ({ pageParam }) => {
      if (!sessionId) {
        return {
          messages: [],
          nextCursor: null
        };
      }

      // Only apply server-side filtering for pinned messages or when searching
      const serverSideFilter = filter === MessageFilterType.PINNED || searchTerm ? filter : MessageFilterType.ALL;

      // Dynamically adapt page size for search queries to ensure we get enough results
      const effectivePageSize = searchTerm ? Math.max(50, defaultPageSize) : defaultPageSize;

      const messages = await fetchMessages(
        sessionId,
        pageParam as string | null,
        {
          pageSize: effectivePageSize,
          filter: serverSideFilter,
          searchTerm: searchTerm,
          includeFileContent: includeFileContent,
          selectFields: selectFields,
        }
      );

      const nextCursor = messages.length === effectivePageSize
        ? messages[messages.length - 1]?.created_at
        : null;

      return {
        messages,
        nextCursor
      };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    getPreviousPageParam: (firstPage) => firstPage.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!sessionId,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Get message mutation hooks
  const { sendMessage, createSession } = useMessageMutation(sessionId);

  // Fetch pinned messages
  useEffect(() => {
    const fetchPinnedMessages = async () => {
      if (!sessionId) return;

      setIsLoadingPins(true);
      try {
        const { data: pinData, error } = await supabase
          .from('message_pins')
          .select('*')
          .eq('session_id', sessionId);

        if (error) throw error;

        setPinnedMessages(pinData || []);
      } catch (error) {
        console.error('Error fetching pinned messages:', error);
        toast({
          title: "Error",
          description: "Failed to load pinned messages",
          variant: "destructive"
        });
      } finally {
        setIsLoadingPins(false);
      }
    };

    fetchPinnedMessages();
  }, [sessionId]);

  // Set up real-time subscription for new messages
  useEffect(() => {
    if (!sessionId || !enableRealtime) return;

    // Clean up existing subscription
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
    }

    // Set up new subscription
    const channel = supabase
      .channel(`chat-messages-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          console.log('Real-time message update:', payload);

          // Handle different event types
          if (payload.eventType === 'INSERT') {
            queryClient.invalidateQueries({ queryKey: ['chat-messages', sessionId] });
          } else if (payload.eventType === 'UPDATE') {
            // Update the specific message in cache
            queryClient.setQueryData(['chat-messages', sessionId], (oldData: any) => {
              if (!oldData) return oldData;

              return {
                ...oldData,
                pages: oldData.pages.map((page: any) => ({
                  ...page,
                  messages: page.messages.map((msg: Message) =>
                    msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
                  )
                }))
              };
            });
          } else if (payload.eventType === 'DELETE') {
            // Remove deleted message from cache
            queryClient.setQueryData(['chat-messages', sessionId], (oldData: any) => {
              if (!oldData) return oldData;

              return {
                ...oldData,
                pages: oldData.pages.map((page: any) => ({
                  ...page,
                  messages: page.messages.filter((msg: Message) => msg.id !== payload.old.id)
                }))
              };
            });
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient, enableRealtime]);

  // Enhanced refetch with loading state
  const refetch = useCallback(async (options?: { preserveScroll?: boolean }) => {
    if (sessionId) {
      if (!options?.preserveScroll) {
        setLastScrollPosition(0); // Reset scroll position
      }
      setIsRefetching(true);
      try {
        await baseRefetch();
      } finally {
        setIsRefetching(false);
      }
    }
  }, [sessionId, baseRefetch]);

  // Combine all pages of messages
  const allMessages = (data?.pages ?? []).flatMap(page => page.messages);

  // Store all fetched messages in ref for client-side filtering
  useEffect(() => {
    if (allMessages.length > 0) {
      allMessagesRef.current = allMessages;
    }
  }, [allMessages]);

  // Apply client-side filtering for message types (except pinned which is server-side)
  const filteredMessages = useMemo(() => {
    if (filter === MessageFilterType.ALL || filter === MessageFilterType.PINNED) {
      return allMessages;
    }

    return allMessages.filter(message => {
      switch (filter) {
        case MessageFilterType.QUERY:
          return message.role === 'user';
        case MessageFilterType.ANALYSIS:
          return message.role === 'assistant' && message.status === 'completed';
        case MessageFilterType.ERROR:
          return message.status === 'failed' || message.status === 'cancelled';
        default:
          return true;
      }
    });
  }, [allMessages, filter]);

  // Enhanced search with multiple options and highlighting
  const searchMessages = useCallback((searchTerm: string, options?: {
    includeFileContent?: boolean,
    clientSideOnly?: boolean,
    semantic?: boolean
  }): { messages: Message[], hasMore: boolean } => {
    const { clientSideOnly = false, semantic = false } = options || {};

    if (!searchTerm.trim()) {
      return { messages: filteredMessages, hasMore: false };
    }

    // For client-side only search, use the currently loaded messages
    if (clientSideOnly) {
      const normalizedSearchTerm = searchTerm.toLowerCase().trim();
      const matchedMessages = filteredMessages.filter(message =>
        message.content.toLowerCase().includes(normalizedSearchTerm) ||
        (message.message_files && message.message_files.some(file =>
          file.filename?.toLowerCase().includes(normalizedSearchTerm)
        ))
      );

      // Highlight matches in the message content
      const highlightedMessages = matchedMessages.map(message => ({
        ...message,
        content: highlightSearchTerms(message.content, normalizedSearchTerm),
        _highlightedContent: true // Mark as highlighted
      }));

      return { messages: highlightedMessages, hasMore: hasNextPage || false };
    }

    // If not client-side only, trigger a server search by updating state
    setSearchTerm(searchTerm);
    setIncludeFileContent(!!options?.includeFileContent);

    // For semantic search, we'd need to implement it separately
    if (semantic) {
      performSemanticSearch(searchTerm);
    }

    return { messages: filteredMessages, hasMore: hasNextPage || false };
  }, [filteredMessages, hasNextPage]);

  // Debounced search to avoid too many requests
  const debouncedSearch = useCallback(
    debounce((term: string, options?: { includeFileContent?: boolean }) => {
      setIsSearching(true);
      searchMessages(term, {
        includeFileContent: options?.includeFileContent,
        clientSideOnly: false
      });
      setIsSearching(false);
    }, 500),
    [searchMessages]
  );

  // Function to set filter type
  const filterMessages = useCallback((filterType: MessageFilterType) => {
    setFilter(filterType);
    setLastScrollPosition(0); // Reset scroll position when changing filters
  }, []);

  // Clear search and filters
  const clearFilters = useCallback(() => {
    setFilter(MessageFilterType.ALL);
    setSearchTerm('');
    setIncludeFileContent(false);
    setSemanticResults([]);
    setLastScrollPosition(0);
  }, []);

  // Semantic search implementation
  const performSemanticSearch = useCallback(async (query: string) => {
    if (!sessionId || !query.trim()) return;

    try {
      setIsSearching(true);

      // Here you would call your semantic search API
      // For now, we'll simulate it with a function call
      const { data: searchData, error } = await supabase.functions.invoke('semantic-search', {
        body: {
          sessionId,
          query,
          limit: 10
        }
      });

      if (error) throw error;

      if (searchData && searchData.results) {
        // Store the message IDs from semantic search results
        setSemanticResults(searchData.results.map((r: any) => r.id));
      }
    } catch (error) {
      console.error('Semantic search error:', error);
      toast({
        title: "Search Error",
        description: "Failed to perform semantic search",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  }, [sessionId]);

  // Message deletion with optimistic UI updates
  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!sessionId) throw new Error("No active session");
      return deleteMessageService(messageId, sessionId);
    },
    onMutate: async (messageId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['chat-messages', sessionId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(['chat-messages', sessionId]);

      // Optimistically update the UI
      queryClient.setQueryData(['chat-messages', sessionId], (old: any) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            messages: page.messages.filter((msg: Message) => msg.id !== messageId)
          }))
        };
      });

      return { previousMessages };
    },
    onError: (err, messageId, context) => {
      // Revert to previous state if mutation fails
      if (context?.previousMessages) {
        queryClient.setQueryData(['chat-messages', sessionId], context.previousMessages);
      }

      console.error('Error deleting message:', err);
      toast({
        title: "Error",
        description: "Failed to delete message",
        variant: "destructive"
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Message deleted successfully",
      });
    },
    onSettled: () => {
      // Refetch to ensure sync with server
      refetch({ preserveScroll: true });
    }
  });

  // Message editing mutation
  const editMessageMutation = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      if (!sessionId) throw new Error("No active session");
      return editMessageService(messageId, content, sessionId);
    },
    onMutate: async ({ messageId, content }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['chat-messages', sessionId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(['chat-messages', sessionId]);

      // Optimistically update the UI
      queryClient.setQueryData(['chat-messages', sessionId], (old: any) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            messages: page.messages.map((msg: Message) =>
              msg.id === messageId
                ? { ...msg, content, updated_at: new Date().toISOString(), is_edited: true }
                : msg
            )
          }))
        };
      });

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      // Revert to previous state if mutation fails
      if (context?.previousMessages) {
        queryClient.setQueryData(['chat-messages', sessionId], context.previousMessages);
      }

      console.error('Error editing message:', err);
      toast({
        title: "Error",
        description: "Failed to edit message",
        variant: "destructive"
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Message updated successfully",
      });
    },
    onSettled: () => {
      // Refetch to ensure sync with server
      refetch({ preserveScroll: true });
    }
  });

  // Message pinning mutation
  const pinMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!sessionId) throw new Error("No active session");
      return pinMessageService(messageId, sessionId);
    },
    onMutate: async (messageId) => {
      // Update local state optimistically
      setPinnedMessages(prev => [
        ...prev,
        { id: Date.now().toString(), message_id: messageId, session_id: sessionId!, created_at: new Date().toISOString(), user_id: null }
      ]);

      return { messageId };
    },
    onError: (err, messageId) => {
      console.error('Error pinning message:', err);
      toast({
        title: "Error",
        description: "Failed to pin message",
        variant: "destructive"
      });

      // Revert optimistic update
      setPinnedMessages(prev => prev.filter(pin => pin.message_id !== messageId));
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Message pinned successfully",
      });

      // Update with actual data from server
      setPinnedMessages(prev => {
        const filtered = prev.filter(pin => pin.message_id !== data.message_id);
        return [...filtered, data];
      });
    }
  });

  // Message unpinning mutation
  const unpinMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!sessionId) throw new Error("No active session");
      return unpinMessageService(messageId, sessionId);
    },
    onMutate: async (messageId) => {
      // Update local state optimistically
      setPinnedMessages(prev => prev.filter(pin => pin.message_id !== messageId));

      return { messageId };
    },
    onError: (err, messageId) => {
      console.error('Error unpinning message:', err);
      toast({
        title: "Error",
        description: "Failed to unpin message",
        variant: "destructive"
      });

      // Try to restore previous pin - this might need a query to get the correct data
      const getPinData = async () => {
        const { data } = await supabase
          .from('message_pins')
          .select('*')
          .eq('message_id', messageId)
          .eq('session_id', sessionId!)
          .single();

        if (data) {
          setPinnedMessages(prev => [...prev, data]);
        }
      };
      
      getPinData().catch(console.error);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Message unpinned successfully",
      });
    }
  });

  // Check if a message is pinned
  const isMessagePinned = useCallback((messageId: string): boolean => {
    return pinnedMessages.some(pin => pin.message_id === messageId);
  }, [pinnedMessages]);

  // Load more messages when scrolling up
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setLastScrollPosition(target.scrollTop);

    if (!hasNextPage || isFetchingNextPage) return;

    if (target.scrollTop === 0) {
      const scrollPosition = target.scrollHeight;

      fetchNextPage().then(() => {
        if (target.scrollHeight !== scrollPosition) {
          target.scrollTop = target.scrollHeight - scrollPosition;
        }
      });
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Helper to determine message type
  const getMessageType = useCallback((message: Message): MessageType => {
    if (message.role === 'user') return MessageType.QUERY;
    if (message.status === 'failed' || message.status === 'cancelled') return MessageType.ERROR;
    return MessageType.ANALYSIS;
  }, []);

  // Mock draft message functions
  const saveMessageDraft = useCallback((message: string) => {
    if (sessionId) {
      localStorage.setItem(`draft_${sessionId}`, message);
    }
  }, [sessionId]);

  const getDraftMessage = useCallback(() => {
    if (sessionId) {
      return localStorage.getItem(`draft_${sessionId}`) || '';
    }
    return '';
  }, [sessionId]);

  // Mock message statistics
  const getMessageStatistics = useCallback(() => {
    if (!allMessages.length) return null;
    
    const userCount = allMessages.filter(m => m.role === 'user').length;
    const assistantCount = allMessages.filter(m => m.role === 'assistant').length;
    const processingCount = allMessages.filter(m => m.status === 'processing').length;
    
    // Calculate average processing time (mock)
    const processingTimes = allMessages
      .filter(m => m.role === 'assistant' && m.metadata?.processing_stage)
      .map(m => {
        const stage = m.metadata?.processing_stage;
        return stage ? (stage.last_updated - stage.started_at) : 0;
      });
    
    const averageProcessingTime = processingTimes.length
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : null;
    
    return {
      totalCount: allMessages.length,
      userCount,
      assistantCount,
      processingCount,
      averageProcessingTime
    };
  }, [allMessages]);

  return {
    messages: allMessages,
    filteredMessages,
    isLoading: isLoading || isRefetching || isSearching,
    isError,
    error,
    createSession,
    sendMessage,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    handleScroll,
    lastScrollPosition,

    searchMessages,
    debouncedSearch,
    filterMessages,
    clearFilters,
    currentFilter: filter,
    currentSearchTerm: searchTerm,
    includeFileContent,
    setIncludeFileContent,
    isSearching,
    semanticResults,
    performSemanticSearch,

    deleteMessage: deleteMessageMutation.mutate,
    isDeletingMessage: deleteMessageMutation.isPending,
    editMessage: editMessageMutation.mutate,
    isEditingMessage: editMessageMutation.isPending,
    pinMessage: pinMessageMutation.mutate,
    unpinMessage: unpinMessageMutation.mutate,
    isPinningMessage: pinMessageMutation.isPending || unpinMessageMutation.isPending,
    isMessagePinned,
    pinnedMessages,
    isLoadingPins,

    getMessageType,
    saveMessageDraft,
    getDraftMessage,
    getMessageStatistics
  };
}
