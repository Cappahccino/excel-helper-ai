import React from "react";
import { Database } from "@/integrations/supabase/types";

type Message = Database["public"]["Tables"]["chat_messages"]["Row"];

interface ChatMessagesProps {
  messages: Message[] | null;
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  if (!messages || messages.length === 0) return null;

  return (
    <div className="mt-8 space-y-4 text-left">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`p-4 rounded-lg ${
            message.is_ai_response
              ? "bg-blue-900/30 ml-4"
              : "bg-gray-800/50 mr-4"
          }`}
        >
          {message.content}
        </div>
      ))}
    </div>
  );
}