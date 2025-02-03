import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ExcelPreview } from "@/components/ExcelPreview";
import { FileUploadZone } from "@/components/FileUploadZone";
import { useFileUpload } from "@/hooks/useFileUpload";
import { ChatThread } from "@/components/chat/ChatThread";
import { ThreadList } from "@/components/chat/ThreadList";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const Chat = () => {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    file: uploadedFile,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileId,
  } = useFileUpload();

  const { mutate: createThread } = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('chat_threads')
        .insert({
          user_id: user.id,
          excel_file_id: fileId,
          title: uploadedFile?.name || 'New Chat',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setActiveThreadId(data.id);
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create chat thread",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      <div className="w-64 border-r pr-4">
        <ThreadList 
          onSelectThread={setActiveThreadId}
          selectedThreadId={activeThreadId}
        />
      </div>
      
      <div className="flex-1">
        <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border">
          <div className="h-[600px] flex flex-col">
            {!activeThreadId ? (
              <div className="p-4">
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
                      <Button
                        onClick={() => createThread()}
                        className="bg-excel hover:bg-excel/90"
                      >
                        Start New Chat
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <ChatThread threadId={activeThreadId} fileId={fileId} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;