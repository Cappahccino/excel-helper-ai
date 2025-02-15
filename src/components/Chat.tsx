
import { useState, useCallback, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ExcelPreview } from "./ExcelPreview";
import { FileUploadZone } from "./FileUploadZone";
import { useFileUpload } from "@/hooks/useFileUpload";
import { supabase } from "@/integrations/supabase/client";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { debounce } from "lodash";
import { ScrollArea } from "./ui/scroll-area";
import { ProcessingStatus } from "./ProcessingStatus";
import { useProcessingStatus } from "@/hooks/useProcessingStatus";
import { useNavigate, useLocation } from "react-router-dom";

interface ChatMessage {
  id: string;
  content: string;
  is_ai_response: boolean;
  created_at: string;
  excel_file_id: string;
  session_id: string;
  role: "user" | "assistant";
}

interface QueryResponse {
  messages: ChatMessage[];
  nextPage: number | undefined;
  count: number;
}

export function Chat() {
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(location.search);
  const threadId = urlParams.get("thread");
  const sessionId = threadId;

  const {
    file: uploadedFile,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileId,
  } = useFileUpload();

  const { status, error, isProcessing } = useProcessingStatus(fileId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, []);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch: refetchMessages } =
    useInfiniteQuery<QueryResponse>({
      queryKey: ["chat-messages", fileId, sessionId],
      queryFn: async ({ pageParam = 0 }) => {
        if (!fileId && !sessionId) return { messages: [], nextPage: undefined, count: 0 };
        const start = Number(pageParam) * 20;
        const { data, error, count } = await supabase
          .from("chat_messages")
          .select("*", { count: "exact" })
          .eq(sessionId ? "session_id" : "excel_file_id", sessionId ? sessionId : fileId)
          .order("created_at", { ascending: false })
          .range(start, start + 19);

        if (error) throw error;
        return {
          messages: data as ChatMessage[],
          nextPage: data.length === 20 ? Number(pageParam) + 1 : undefined,
          count: count || 0,
        };
      },
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled: !!(fileId || sessionId),
    });

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`chat_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        async () => {
          await queryClient.invalidateQueries({ 
            queryKey: ['chat-messages', fileId, sessionId] 
          });
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient, fileId]);

  const debouncedSetMessage = useCallback(
    debounce((value: string) => {
      setMessage(value);
    }, 300),
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("User not authenticated");

      let newSessionId = sessionId;
      let newFileId = fileId || null;

      // ✅ Step 1: Create a new session if one doesn't exist
      if (!sessionId) {
        const { data: newSession, error: sessionError } = await supabase
          .from("chat_sessions")
          .insert([{ 
            user_id: user.id, 
            excel_file_id: newFileId,
            status: "active",
            thread_id: crypto.randomUUID()
          }])
          .select()
          .single();

        if (sessionError) throw sessionError;
        newSessionId = newSession.session_id;

        // ✅ Step 2: Redirect user to the new chat session before sending the message
        const queryParams = new URLSearchParams();
        queryParams.set('thread', newSessionId);
        if (newFileId) queryParams.set('fileId', newFileId);
        navigate(`/chat?${queryParams.toString()}`, { replace: true });

        // ✅ Step 3: Wait for React Router to update the URL before continuing
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // ✅ Step 4: Send message to OpenAI via Supabase Function
      const { data: analysis, error: aiError } = await supabase.functions
        .invoke("excel-assistant", {
          body: { 
            fileId: newFileId,
            query: message,
            userId: user.id,
            threadId: newSessionId,
            sessionId: newSessionId
          }
        });

      if (aiError) throw aiError;

      // ✅ Step 5: Store the message under the correct session
      const { error: messageError } = await supabase
        .from("chat_messages")
        .insert([{ 
          content: message, 
          role: "user", 
          excel_file_id: newFileId,
          session_id: newSessionId,
          is_ai_response: false,
          user_id: user.id
        }]);

      if (messageError) throw messageError;

      setMessage("");
      
      // ✅ Step 6: Refetch messages for the new session
      queryClient.invalidateQueries({ 
        queryKey: ["chat-messages", newSessionId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ["chat-session", newSessionId, newFileId] 
      });

      scrollToBottom();

    } catch (err) {
      console.error("Analysis error:", err);
      toast({
        title: "Analysis Failed",
        description: err instanceof Error ? err.message : "Failed to analyze request",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUploadComplete = () => {
    console.log("Upload completed");
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border">
      <div className="h-[600px] flex flex-col">
        <div className="flex-1 p-4 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4">
              <FileUploadZone
                onFileUpload={handleFileUpload}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                currentFile={uploadedFile}
                onReset={resetUpload}
                onUploadComplete={handleUploadComplete}
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
                        msg.role === "assistant" ? "bg-blue-50 ml-4" : "bg-gray-50 mr-4"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                </div>
              ))}

              {isAnalyzing && (
                <div className="p-4 bg-blue-50 ml-4 rounded-lg animate-pulse">
                  <p className="text-sm text-gray-600">Assistant is thinking...</p>
                </div>
              )}
              
              <div ref={messagesEndRef} />
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
              disabled={isAnalyzing || isUploading || isProcessing}
            />
            <Button 
              type="submit" 
              className="bg-excel hover:bg-excel/90"
              disabled={!message.trim() || isAnalyzing || isUploading || isProcessing}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
