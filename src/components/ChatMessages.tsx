import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { Database } from "@/integrations/supabase/types";

type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];

interface ChatMessagesProps {
  messages: { messages: ChatMessage[] }[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export const ChatMessages = ({ 
  messages, 
  hasNextPage, 
  isFetchingNextPage, 
  fetchNextPage 
}: ChatMessagesProps) => {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4">
        <div className="bg-muted p-3 rounded-lg max-w-[80%]">
          <p className="text-sm">
            Hello! Upload an Excel file and I'll help you analyze it.
          </p>
        </div>

        {messages?.map((page, i) => (
          <div key={i} className="space-y-4">
            {page.messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-4 rounded-lg ${
                  msg.is_ai_response
                    ? "bg-blue-50 ml-4"
                    : "bg-gray-50 mr-4"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
          </div>
        ))}

        {hasNextPage && (
          <Button
            variant="ghost"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full"
          >
            {isFetchingNextPage ? "Loading more..." : "Load more messages"}
          </Button>
        )}
      </div>
    </ScrollArea>
  );
};