import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";

interface ThreadListProps {
  onSelectThread: (threadId: string) => void;
  selectedThreadId?: string;
}

export function ThreadList({ onSelectThread, selectedThreadId }: ThreadListProps) {
  const { data: threads, isLoading } = useQuery({
    queryKey: ['threads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_threads')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {threads?.map((thread) => (
        <Button
          key={thread.id}
          variant={selectedThreadId === thread.id ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => onSelectThread(thread.id)}
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          {thread.title}
        </Button>
      ))}
    </div>
  );
}