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
import { ProcessingStatus } from "./ProcessingStatus";
import { useProcessingStatus } from "@/hooks/useProcessingStatus";

interface ChatMessage {
  id: string;
  content: string;
  is_ai_response: boolean;
  created_at: string;
  excel_file_id: string;
  role: 'user' | 'assistant';
}

interface PaginatedResponse {
  messages: ChatMessage[];
  nextPage: number | undefined;
  count: number;
}

async function storeChatMessage(fileId: string, content: string, isAiResponse: boolean = false, sessionId: string | null = null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const { data, error } = await supabase
    .from("chat_messages")
    .insert([{ 
      excel_file_id: fileId,
      content,
      is_ai_response: isAiResponse,
      session_id: sessionId,
      user_id: user.id
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export function Chat() {
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();
  const {
    file: uploadedFile,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileId,
    threadId,
  } = useFileUpload();

  const { status, error, isProcessing } = useProcessingStatus(fileId);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch: refetchMessages } = useInfiniteQuery<PaginatedResponse>({
    queryKey: ["chat-messages", fileId],
    queryFn: async (context) => {
      const pageParam = (context.pageParam as number) ?? 0;
      if (!fileId) return { messages: [], nextPage: undefined, count: 0 };
      const start = pageParam * 20;
      const { data, error, count } = await supabase
        .from("chat_messages")
        .select("*", { count: "exact" })
        .eq("excel_file_id", fileId)
        .order("created_at", { ascending: false })
        .range(start, start + 19);

      if (error) throw error;
      return {
        messages: data as ChatMessage[],
        nextPage: data.length === 20 ? pageParam + 1 : undefined,
        count: count || 0,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!fileId,
  });

  const debouncedSetMessage = useCallback(
    debounce((value: string) => {
      setMessage(value);
    }, 300),
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !fileId || isAnalyzing || !threadId) return;

    try {
      setIsAnalyzing(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("User not authenticated");

      const { data: analysis, error } = await supabase.functions
        .invoke("excel-assistant", {
          body: { 
            fileId, 
            query: message,
            userId: user.id,
            threadId 
          }
        });

      if (error) throw error;
      await refetchMessages();
      setMessage("");
    } catch (error) {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze Excel file",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
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
                <>
                  <div className="w-full">
                    <ExcelPreview file={uploadedFile} />
                  </div>
                  <ProcessingStatus status={status} error={error} />
                </>
              )}

              {data?.pages.map((page, i) => (
                <div key={i} className="space-y-4">
                  {page.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-lg ${
                        msg.role === 'assistant'
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
              disabled={!fileId || isUploading || isProcessing}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
