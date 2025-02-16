
import { FileUploadZone } from "@/components/FileUploadZone";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { useLocation } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SidebarProvider } from "@/components/ui/sidebar-new";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { MessageContent } from "@/components/message/MessageContent";
import { ChatInput } from "@/components/ChatInput";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useChatRealtime } from "@/hooks/useChatRealtime";

const Chat = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const selectedSessionId = searchParams.get('sessionId');
  const fileIdFromUrl = searchParams.get('fileId');

  const {
    file: uploadedFile,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileId: uploadedFileId
  } = useChatFileUpload();

  const { data: selectedFile } = useQuery({
    queryKey: ['excel-file', fileIdFromUrl],
    queryFn: async () => {
      if (!fileIdFromUrl) return null;
      const { data, error } = await supabase
        .from('excel_files')
        .select('*')
        .eq('id', fileIdFromUrl)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!fileIdFromUrl && !selectedSessionId
  });

  const {
    messages,
    isLoading: messagesLoading,
    sendMessage: sendMessageMutation,
    formatTimestamp,
    refetch
  } = useChatMessages(selectedSessionId);

  const { status, latestMessageId } = useChatRealtime({
    sessionId: selectedSessionId,
    refetch,
    onAssistantMessage: () => {}
  });

  const handleSendMessage = async (message: string, fileId?: string | null) => {
    if (!message.trim() && !fileId) return;
    const activeFileId = fileId || uploadedFileId || fileIdFromUrl;
    await sendMessageMutation.mutateAsync({ content: message, fileId: activeFileId });
    resetUpload();
  };

  const activeFileId = uploadedFileId || fileIdFromUrl;
  
  const currentFile = selectedFile || (uploadedFile ? {
    filename: uploadedFile.name,
    file_size: uploadedFile.size
  } : null);

  const showUploadZone = !selectedSessionId && !activeFileId;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50">
        <div className="fixed left-0 top-0 h-full z-10">
          <ChatSidebar />
        </div>
        <div className="flex-1 flex flex-col transition-all duration-200 ml-[60px] sidebar-expanded:ml-[300px]">
          {!selectedSessionId ? (
            <div className="flex-grow flex items-center justify-center px-4 lg:px-6">
              <div className="w-full max-w-3xl mx-auto">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center mb-8"
                >
                  <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                    Welcome to Excel Assistant
                  </h2>
                  <p className="text-gray-600">
                    Ask me anything about Excel, or upload a file for analysis using the paperclip button below.
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <ChatInput
                    onSendMessage={handleSendMessage}
                    sessionId={selectedSessionId}
                    isAnalyzing={status === 'in_progress'}
                    fileInfo={currentFile}
                  />
                </motion.div>
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-grow flex flex-col h-[calc(100vh-80px)]"
            >
              <div className="w-full mx-auto max-w-7xl flex-grow flex flex-col px-4 lg:px-6 pt-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-grow flex flex-col overflow-hidden bg-white rounded-xl shadow-sm border border-gray-100 mb-24"
                >
                  <ScrollArea className="flex-grow p-4">
                    <div className="space-y-6">
                      {messages.map(msg => (
                        <MessageContent
                          key={msg.id}
                          content={msg.content}
                          role={msg.role as 'user' | 'assistant'}
                          timestamp={formatTimestamp(msg.created_at)}
                          fileInfo={msg.excel_files}
                          isNewMessage={msg.id === latestMessageId}
                          status={msg.id === latestMessageId ? status : 'completed'}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </motion.div>
              </div>
              <div className="fixed bottom-0 left-[60px] right-0 transition-all duration-200 sidebar-expanded:left-[300px]">
                <div className="w-full max-w-7xl mx-auto px-4 pb-4">
                  <div className="backdrop-blur-sm shadow-lg bg-transparent rounded-none mx-[13px] py-0 my-0 px-0">
                    <ChatInput
                      onSendMessage={handleSendMessage}
                      sessionId={selectedSessionId}
                      isAnalyzing={status === 'in_progress'}
                      fileInfo={currentFile}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
}

export default Chat;
