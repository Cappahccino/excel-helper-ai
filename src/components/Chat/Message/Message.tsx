import { Database } from "@/integrations/supabase/types";

type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];

interface MessageProps {
  message: ChatMessage;
}

export function Message({ message }: MessageProps) {
  return (
    <div
      className={`p-4 rounded-lg ${
        message.is_ai_response
          ? "bg-blue-50 ml-4"
          : "bg-gray-50 mr-4"
      }`}
    >
      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
    </div>
  );
}