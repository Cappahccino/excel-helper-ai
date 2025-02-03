import { Button } from "@/components/ui/button";
import { Message } from "../Message/Message";
import { Database } from "@/integrations/supabase/types";
import { ScrollArea } from "@/components/ui/scroll-area";

type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];

interface MessageListProps {
  messages: ChatMessage[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function MessageList({ 
  messages, 
  hasNextPage, 
  isFetchingNextPage, 
  onLoadMore 
}: MessageListProps) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4">
        <div className="bg-muted p-3 rounded-lg max-w-[80%]">
          <p className="text-sm">
            Hello! Upload an Excel file and I'll help you analyze it.
          </p>
        </div>

        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}

        {hasNextPage && (
          <Button
            variant="ghost"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            className="w-full"
          >
            {isFetchingNextPage ? "Loading more..." : "Load more messages"}
          </Button>
        )}
      </div>
    </ScrollArea>
  );
}