import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Message } from "./Message";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";

const MESSAGES_PER_PAGE = 20;

interface QueryResponse {
  messages: {
    id: string;
    content: string;
    is_ai_response: boolean;
    status: 'sent' | 'pending' | 'error';
    created_at: string;
  }[];
  count: number;
}

export function MessageList({ threadId }: { threadId: string }) {
  const { ref, inView } = useInView();

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = useInfiniteQuery<QueryResponse>({
    queryKey: ['messages', threadId],
    queryFn: async ({ pageParam = 0 }) => {
      const start = Number(pageParam) * MESSAGES_PER_PAGE;
      
      const { data, error, count } = await supabase
        .from('chat_messages')
        .select('id, content, is_ai_response, status, created_at', { count: 'exact' })
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .range(start, start + MESSAGES_PER_PAGE - 1);

      if (error) {
        throw error;
      }

      // Ensure the status is one of our allowed values
      const messages = (data || []).map(msg => ({
        ...msg,
        status: (msg.status === 'sent' || msg.status === 'pending' || msg.status === 'error' 
          ? msg.status 
          : 'sent') as 'sent' | 'pending' | 'error'
      }));

      return {
        messages,
        count: count || 0,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const totalPages = Math.ceil(lastPage.count / MESSAGES_PER_PAGE);
      const nextPage = allPages.length;
      return nextPage < totalPages ? nextPage : undefined;
    },
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (status === 'pending') {
    return <div>Loading messages...</div>;
  }

  if (status === 'error') {
    return <div>Error: {error.message}</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="flex flex-col-reverse gap-4">
      {data.pages.map((page) =>
        page.messages.map((message) => (
          <Message
            key={message.id}
            content={message.content}
            isAiResponse={message.is_ai_response}
            status={message.status}
          />
        ))
      )}
      <div ref={ref} className="h-1" />
    </div>
  );
}