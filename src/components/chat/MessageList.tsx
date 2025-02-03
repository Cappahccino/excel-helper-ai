import { useEffect, useRef, useCallback } from "react";
import { Message } from "./Message";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInView } from "react-intersection-observer";

const MESSAGES_PER_PAGE = 20;

interface MessageListProps {
  threadId: string;
}

type MessageStatus = 'sent' | 'pending' | 'error';

interface ChatMessage {
  id: string;
  content: string;
  is_ai_response: boolean;
  status: MessageStatus;
  created_at: string;
}

export function MessageList({ threadId }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { ref: loadMoreRef, inView } = useInView();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['messages', threadId],
    queryFn: async ({ pageParam = 0 }) => {
      const start = pageParam * MESSAGES_PER_PAGE;
      
      const { data, error, count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact' })
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .range(start, start + MESSAGES_PER_PAGE - 1);
      
      if (error) throw error;
      
      return {
        messages: data.map(message => ({
          ...message,
          status: message.status as MessageStatus
        })),
        count,
      };
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalPages = Math.ceil(lastPage.count / MESSAGES_PER_PAGE);
      const nextPage = allPages.length;
      return nextPage < totalPages ? nextPage : undefined;
    },
    initialPageSize: MESSAGES_PER_PAGE,
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
      </div>
    );
  }

  const messages = data?.pages.flatMap(page => page.messages) ?? [];

  return (
    <div className="space-y-4">
      {hasNextPage && (
        <div ref={loadMoreRef} className="h-4">
          {isFetchingNextPage && (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-excel"></div>
            </div>
          )}
        </div>
      )}
      
      {messages.map((message) => (
        <Message
          key={message.id}
          content={message.content}
          isAiResponse={message.is_ai_response}
          status={message.status}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}