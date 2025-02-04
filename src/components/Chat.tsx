import { useState, useCallback, useEffect } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ExcelPreview } from "./ExcelPreview";
import { FileUploadZone } from "./FileUploadZone";
import { useFileUpload } from "@/hooks/useFileUpload";
import { supabase } from "@/integrations/supabase/client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { debounce } from "lodash";
import { ChatMessages } from "./ChatMessages";
import { ProcessingStatus } from "./ProcessingStatus";

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
    setUploadProgress,
  } = useFileUpload();

  // Subscribe to real-time updates for the current file
  useEffect(() => {
    if (!fileId) return;

    const channel = supabase
      .channel('excel_files_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'excel_files',
          filter: `id=eq.${fileId}`
        },
        (payload) => {
          console.log('Real-time update received:', payload);
          const newFile = payload.new as any;
          const oldFile = payload.old as any;
          
          if (newFile && 'upload_progress' in newFile) {
            setUploadProgress(newFile.upload_progress ?? 0);
          }
          
          if (
            newFile && 
            newFile.processing_status === 'completed' &&
            oldFile?.processing_status !== 'completed'
          ) {
            toast({
              title: "File Processing Complete",
              description: "Your Excel file has been processed successfully.",
            });
          }

          if (
            newFile && 
            newFile.processing_status === 'error' &&
            oldFile?.processing_status !== 'error'
          ) {
            toast({
              title: "Processing Error",
              description: newFile.error_message || "An error occurred while processing your file.",
              variant: "destructive",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fileId, toast, setUploadProgress]);

  // Query to get file status
  const { data: fileStatus } = useQuery({
    queryKey: ['file-status', fileId],
    queryFn: async () => {
      if (!fileId) return null;
      const { data, error } = await supabase
        .from('excel_files')
        .select('processing_status, error_message')
        .eq('id', fileId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!fileId,
    refetchInterval: (data) => 
      data && data.processing_status === 'processing' ? 5000 : false,
  });

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
        messages: data,
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
          <div className="flex flex-col gap-4">
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
                <ProcessingStatus 
                  status={fileStatus?.processing_status}
                  errorMessage={fileStatus?.error_message}
                />
              </div>
            )}

            <ChatMessages
              messages={data?.pages || []}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
            />
          </div>
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
              disabled={!fileId || isUploading || fileStatus?.processing_status === 'processing'}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}