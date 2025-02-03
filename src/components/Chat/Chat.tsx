import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useFileUpload } from "@/hooks/useFileUpload";
import { supabase } from "@/integrations/supabase/client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Database } from "@/integrations/supabase/types";
import { ChatThread } from "./ChatThread/ChatThread";

type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];

const MESSAGES_PER_PAGE = 20;

export function Chat() {
  const [message, setMessage] = useState("");
  const { toast } = useToast();
  const {
    file: uploadedFile,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileId,
  } = useFileUpload();

  // Fetch messages with pagination
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['chat-messages', fileId],
    queryFn: async ({ pageParam }) => {
      const start = (pageParam as number) * MESSAGES_PER_PAGE;
      const { data, error, count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact' })
        .eq('excel_file_id', fileId)
        .order('created_at', { ascending: false })
        .range(start, start + MESSAGES_PER_PAGE - 1);

      if (error) throw error;
      return {
        messages: data as ChatMessage[],
        nextPage: data.length === MESSAGES_PER_PAGE ? (pageParam as number) + 1 : undefined,
        count,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!fileId,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !fileId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.functions
        .invoke('analyze-excel', {
          body: { fileId, query: message, userId: user.id }
        });

      if (error) throw error;
      setMessage("");
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze Excel file",
        variant: "destructive",
      });
    }
  };

  const allMessages = data?.pages.flatMap(page => page.messages) ?? [];

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border">
      <ChatThread
        messages={allMessages}
        hasNextPage={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        message={message}
        onMessageChange={setMessage}
        onSubmit={handleSubmit}
        isInputDisabled={!fileId || isUploading}
        uploadedFile={uploadedFile}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        onFileUpload={handleFileUpload}
        onResetUpload={resetUpload}
      />
    </div>
  );
}