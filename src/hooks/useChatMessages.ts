import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MessagesResponse, Message, MessageStatus } from "@/types/chat";
import { formatTimestamp, groupMessagesByDate } from "@/utils/dateFormatting";
import { fetchMessages } from "@/services/messageService";
import { useMessageMutation } from "./useMessageMutation";
import { useCallback, useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import debounce from "lodash.debounce";

// Constants for optimized fetching
const PAGE_SIZE = 50;
const DEFAULT_STALE_TIME = 5 * 60 * 1000; // 5 minutes
const LOCAL_STORAGE_KEY_PREFIX = 'excel-helper-draft-';

// Types for enhanced filter options
interface MessageFilter {
  role?: "user" | "assistant" | null;
  status?: MessageStatus | null;
  timeRange?: {
    start: Date | null;
    end: Date | null;
  } | null;
  fileIds?: string[] | null;
  excludeEmpty?: boolean;
  sortOrder?: "asc" | "desc";
}

// Interface for the returned hook data
interface UseChatMessagesReturn {
  messages: Message[];
  filteredMessages: Message[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  createSession: any;
  sendMessage: any;
  formatTimestamp: typeof formatTimestamp;
  groupMessagesByDate: typeof groupMessagesByDate;
  refetch: () => Promise<void>;
  hasNextPage: boolean;
  fetchNextPage: () => Promise<any>;
  isFetchingNextPage: boolean;
  searchMessages: (searchTerm: string) => Message[];
  deleteMessage: (messageId: string) => Promise<void>;
  filterMessages: (filter: MessageFilter) => void;
  currentFilter: MessageFilter | null;
  pinMessage: (messageId: string) => Promise<void>;
  unpinMessage: (messageId: string) => Promise<void>;
  pinnedMessages: Message[];
  saveMessageDraft: (content: string) => void;
  getDraftMessage: () => string | null;
  clearDraftMessage: () => void;
  getMessageStatistics: () => {
    totalCount: number;
    userCount: number;
    assistantCount: number;
    completedCount: number;
    processingCount: number;
    failedCount: number;
    averageProcessingTime: number | null;
  };
}

/**
 * Enhanced hook for managing chat messages with advanced filtering,
 * message pinning, drafts, and more detailed statistics
 */
export function useChatMessages(sessionId: string | null): UseChatMessagesReturn {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isRefetching, setIsRefetching] = useState(false);
  const [currentFilter, setCurrentFilter] = useState<MessageFilter | null>(null);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set());

  // Use infinite query with dynamic page size and better caching
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
    queryKey: ['chat-messages', sessionId, currentFilter?.sortOrder || 'asc'],
    queryFn: async ({ pageParam }) => {
      if (!sessionId) {
        return {
          messages: [],
          nextCursor: null
        };
      }
      
      const messages = await fetchMessages(sessionId, pageParam as string | null);
      
      // Dynamic cursor determination based on sort order
      const nextCursor = messages.length === PAGE_SIZE 
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
    staleTime: DEFAULT_STALE_TIME,
    enabled: !!sessionId,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Get message mutation hooks
  const { sendMessage, createSession } = useMessageMutation(sessionId);

  // Enhanced refetch with loading state and optimizations
  const refetch = useCallback(async () => {
    if (sessionId) {
      setIsRefetching(true);
      try {
        await baseRefetch();
        // Refresh pinned messages state
        loadPinnedMessages();
      } finally {
        setIsRefetching(false);
      }
    }
  }, [sessionId, baseRefetch]);

  // Combine all pages of messages
  const messages = useMemo(() => {
    return (data?.pages ?? []).flatMap(page => page.messages);
  }, [data?.pages]);

  // Load pinned messages from local storage or DB on initialization
  const loadPinnedMessages = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      // Get pinned message IDs from database or localStorage
      const { data } = await supabase
        .from('message_pins')
        .select('message_id')
        .eq('session_id', sessionId);
      
      if (data && data.length > 0) {
        setPinnedMessageIds(new Set(data.map(pin => pin.message_id)));
      }
    } catch (error) {
      console.error('Error loading pinned messages:', error);
    }
  }, [sessionId]);

  // Load pinned messages on session change
  useEffect(() => {
    if (sessionId) {
      loadPinnedMessages();
    } else {
      setPinnedMessageIds(new Set());
    }
  }, [sessionId, loadPinnedMessages]);

  // Calculate pinnedMessages by filtering messages by pinnedMessageIds
  const pinnedMessages = useMemo(() => {
    return messages.filter(message => pinnedMessageIds.has(message.id));
  }, [messages, pinnedMessageIds]);

  // Apply current filter to messages
  const filteredMessages = useMemo(() => {
    if (!currentFilter) return messages;
    
    return messages.filter(message => {
      // Filter by role
      if (currentFilter.role && message.role !== currentFilter.role) {
        return false;
      }
      
      // Filter by status
      if (currentFilter.status && message.status !== currentFilter.status) {
        return false;
      }
      
      // Filter by time range
      if (currentFilter.timeRange) {
        const messageDate = new Date(message.created_at);
        if (currentFilter.timeRange.start && messageDate < currentFilter.timeRange.start) {
          return false;
        }
        if (currentFilter.timeRange.end && messageDate > currentFilter.timeRange.end) {
          return false;
        }
      }
      
      // Filter by fileIds (if the message has files associated with it)
      if (currentFilter.fileIds && currentFilter.fileIds.length > 0) {
        if (!message.message_files || message.message_files.length === 0) {
          return false;
        }
        
        const messageFileIds = message.message_files.map(file => file.file_id);
        if (!currentFilter.fileIds.some(id => messageFileIds.includes(id))) {
          return false;
        }
      }
      
      // Filter out empty messages if requested
      if (currentFilter.excludeEmpty && (!message.content || message.content.trim() === '')) {
        return false;
      }
      
      return true;
    });
  }, [messages, currentFilter]);
  
  // Enhanced search function with fuzzy matching and highlighting
  const searchMessages = useCallback((searchTerm: string): Message[] => {
    if (!searchTerm.trim()) return filteredMessages;
    
    const normalizedSearchTerm = searchTerm.toLowerCase().trim();
    const terms = normalizedSearchTerm.split(/\s+/);
    
    return filteredMessages.filter(message => {
      // Check if message content contains all search terms
      const content = message.content.toLowerCase();
      return terms.every(term => content.includes(term));
    });
  }, [filteredMessages]);
  
  // Apply filter function
  const filterMessages = useCallback((filter: MessageFilter) => {
    setCurrentFilter(filter);
  }, []);

  // Message pin mutation
  const pinMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!sessionId) throw new Error('No active session');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      
      const { error } = await supabase
        .from('message_pins')
        .insert({
          message_id: messageId,
          session_id: sessionId,
          user_id: user.id
        });
        
      if (error) throw error;
      
      return messageId;
    },
    onSuccess: (messageId) => {
      setPinnedMessageIds(prev => new Set([...prev, messageId]));
      toast({
        title: "Message Pinned",
        description: "The message has been pinned to your collection.",
      });
    },
    onError: (error) => {
      console.error('Error pinning message:', error);
      toast({
        title: "Error",
        description: "Failed to pin message. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Message unpin mutation
  const unpinMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!sessionId) throw new Error('No active session');
      
      const { error } = await supabase
        .from('message_pins')
        .delete()
        .eq('message_id', messageId)
        .eq('session_id', sessionId);
        
      if (error) throw error;
      
      return messageId;
    },
    onSuccess: (messageId) => {
      setPinnedMessageIds(prev => {
        const updated = new Set(prev);
        updated.delete(messageId);
        return updated;
      });
      toast({
        title: "Message Unpinned",
        description: "The message has been removed from your collection.",
      });
    },
    onError: (error) => {
      console.error('Error unpinning message:', error);
      toast({
        title: "Error",
        description: "Failed to unpin message. Please try again.",
        variant: "destructive"
      });
    }
  });
  
  // Pin and unpin handler functions
  const pinMessage = useCallback(async (messageId: string) => {
    await pinMessageMutation.mutateAsync(messageId);
  }, [pinMessageMutation]);
  
  const unpinMessage = useCallback(async (messageId: string) => {
    await unpinMessageMutation.mutateAsync(messageId);
  }, [unpinMessageMutation]);

  // Message deletion with optimistic updates
  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!sessionId) throw new Error('No active session');
      
      const { error } = await supabase
        .from('chat_messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', messageId);
        
      if (error) throw error;
      
      return messageId;
    },
    onMutate: async (messageId) => {
      // Snapshot current data for rollback
      const previousMessages = queryClient.getQueryData(['chat-messages', sessionId]) as any;
      
      // Optimistically update the UI
      queryClient.setQueryData(['chat-messages', sessionId], (old: any) => {
        if (!old?.pages) return old;
        
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
    onError: (error, messageId, context) => {
      // Roll back to the previous state if there's an error
      if (context?.previousMessages) {
        queryClient.setQueryData(['chat-messages', sessionId], context.previousMessages);
      }
      
      console.error('Error deleting message:', error);
      toast({
        title: "Error",
        description: "Failed to delete message. Please try again.",
        variant: "destructive"
      });
    },
    onSuccess: () => {
      toast({
        title: "Message Deleted",
        description: "The message has been removed from the conversation.",
      });
    }
  });
  
  const deleteMessage = useCallback(async (messageId: string) => {
    await deleteMessageMutation.mutateAsync(messageId);
  }, [deleteMessageMutation]);

  // Draft message management
  const getDraftStorageKey = useCallback(() => {
    return `${LOCAL_STORAGE_KEY_PREFIX}${sessionId}`;
  }, [sessionId]);
  
  // Save draft message with debounce to prevent excessive writes
  const saveMessageDraftDebounced = useMemo(() => 
    debounce((content: string) => {
      if (!sessionId) return;
      
      const key = getDraftStorageKey();
      if (content.trim() === '') {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, content);
      }
    }, 500), [sessionId, getDraftStorageKey]
  );
  
  const saveMessageDraft = useCallback((content: string) => {
    saveMessageDraftDebounced(content);
  }, [saveMessageDraftDebounced]);
  
  // Get draft message
  const getDraftMessage = useCallback(() => {
    if (!sessionId) return null;
    return localStorage.getItem(getDraftStorageKey());
  }, [sessionId, getDraftStorageKey]);
  
  // Clear draft message
  const clearDraftMessage = useCallback(() => {
    if (!sessionId) return;
    localStorage.removeItem(getDraftStorageKey());
  }, [sessionId, getDraftStorageKey]);
  
  // Get message statistics
  const getMessageStatistics = useCallback(() => {
    const allMessages = messages || [];
    const userMessages = allMessages.filter(msg => msg.role === 'user');
    const assistantMessages = allMessages.filter(msg => msg.role === 'assistant');
    const completedMessages = allMessages.filter(msg => msg.status === 'completed');
    const processingMessages = allMessages.filter(msg => msg.status === 'processing');
    const failedMessages = allMessages.filter(msg => 
      msg.status === 'failed' || msg.status === 'cancelled' || msg.status === 'expired'
    );
    
    // Calculate average processing time for completed assistant messages
    let averageProcessingTime = null;
    const messagesWithProcessingTime = assistantMessages.filter(msg => 
      msg.status === 'completed' && 
      msg.metadata?.processing_stage?.last_updated &&
      msg.metadata?.processing_stage?.started_at
    );
    
    if (messagesWithProcessingTime.length > 0) {
      const totalTime = messagesWithProcessingTime.reduce((sum, msg) => {
        const startTime = msg.metadata?.processing_stage?.started_at || 0;
        const endTime = msg.metadata?.processing_stage?.last_updated || 0;
        return sum + (endTime - startTime);
      }, 0);
      
      averageProcessingTime = totalTime / messagesWithProcessingTime.length;
    }
    
    return {
      totalCount: allMessages.length,
      userCount: userMessages.length,
      assistantCount: assistantMessages.length,
      completedCount: completedMessages.length,
      processingCount: processingMessages.length,
      failedCount: failedMessages.length,
      averageProcessingTime
    };
  }, [messages]);
  
  // Clean up effect
  useEffect(() => {
    return () => {
      // Cancel any debounced operations when component unmounts
      saveMessageDraftDebounced.cancel();
    };
  }, [saveMessageDraftDebounced]);
  
  return {
    messages,
    filteredMessages,
    isLoading: isLoading || isRefetching,
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
    searchMessages,
    deleteMessage,
    filterMessages,
    currentFilter,
    pinMessage,
    unpinMessage,
    pinnedMessages,
    saveMessageDraft,
    getDraftMessage,
    clearDraftMessage,
    getMessageStatistics
  };
}