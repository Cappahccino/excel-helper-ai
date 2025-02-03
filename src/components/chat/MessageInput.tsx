import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface MessageInputProps {
  threadId: string;
  fileId: string | null;
  disabled?: boolean;
}

export function MessageInput({ threadId, fileId, disabled }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async (content: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions
        .invoke('analyze-excel', {
          body: { 
            fileId, 
            query: content,
            userId: user.id,
            threadId 
          }
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', threadId] });
      setMessage("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled) return;
    sendMessage(message);
  };

  return (
    <form onSubmit={handleSubmit} className="border-t p-4">
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask about your Excel file..."
          className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={disabled || isPending}
        />
        <Button 
          type="submit" 
          className="bg-excel hover:bg-excel/90"
          disabled={disabled || isPending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}