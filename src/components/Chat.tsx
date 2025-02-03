import { useState, useCallback } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ExcelPreview } from "./ExcelPreview";
import { FileUploadZone } from "./FileUploadZone";
import { useFileUpload } from "@/hooks/useFileUpload";
import { supabase } from "@/integrations/supabase/client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { debounce } from "lodash";
import { ScrollArea } from "./ui/scroll-area";
import { Database } from "@/integrations/supabase/types";

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

  // Debounced message handler
  const debouncedSetMessage = useCallback(
    debounce((value: string) => {
      setMessage(value);
    }, 300),
    []
  );

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

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border">
      <div className="h-[600px] flex flex-col">
        <div className="flex-1 p-4 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4">
              <div className="bg-muted p-3 rounded-lg max-w-[80%]">
                <p className="text-sm">
                  Hello! Upload an Excel file and I'll help you analyze it.
                </p>
              </div>
              
              <FileUploadZone
                onFileUpload={handleFileUpload}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                currentFile={uploadedFile}
                onReset={resetUpload}
              />

              {uploadedFile && !isUploading && (
                <div className="w-full">
                  <ExcelPreview file={uploadedFile} />
                </div>
              )}

              {data?.pages.map((page, i) => (
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
        </div>
        
        <form onSubmit={handleSubmit} className="border-t p-4">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={message}
              onChange={(e) => debouncedSetMessage(e.target.value)}
              placeholder="Ask about your Excel file..."
              className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Message input"
            />
            <Button 
              type="submit" 
              className="bg-excel hover:bg-excel/90"
              aria-label="Send message"
              disabled={!fileId || isUploading}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}