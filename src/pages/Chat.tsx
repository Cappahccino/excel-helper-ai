import { FileUploadZone } from "@/components/FileUploadZone";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SidebarProvider } from "@/components/ui/sidebar-new";
import { motion, AnimatePresence } from "framer-motion";
import { ChatInput } from "@/components/ChatInput";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { useState, useMemo, useCallback } from "react";
import { Message } from "@/types/chat";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChatContent } from "@/components/chat/ChatContent";

const Chat = () => {
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!fileIdFromUrl && !selectedSessionId
  });

  const {
    messages: baseMessages,
    isLoading: messagesLoading,
    sendMessage: sendMessageMutation,
    createSession,
    formatTimestamp,
    groupMessagesByDate,
    refetch
  } = useChatMessages(selectedSessionId);

  const handleAssistantMessage = useCallback((message: Message) => {
    console.log('Assistant message updated:', message);
  }, []);

  const { status, latestMessageId, processingStage, content: streamingContent } = useChatRealtime({
    sessionId: selectedSessionId,
    refetch,
    onAssistantMessage: handleAssistantMessage
  });

  const messages = useMemo(() => {
    const messagesList = baseMessages.map(msg => {
      if (msg.id === latestMessageId) {
        return {
          ...msg,
          content: streamingContent || msg.content,
          status: status || msg.status,
          metadata: {
            ...msg.metadata,
            processing_stage: processingStage || msg.metadata?.processing_stage
          }
        };
      }
      return msg;
    });

    if (status === 'in_progress' && !latestMessageId && !streamingContent && selectedSessionId) {
      messagesList.unshift({
        id: 'loading-indicator',
        content: '',
        role: 'assistant',
        session_id: selectedSessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'in_progress',
        is_ai_response: true,
        version: '1.0.0',
        excel_file_id: fileIdFromUrl || null,
        excel_files: null,
        metadata: {
          processing_stage: {
            stage: 'generating',
            started_at: Date.now(),
            last_updated: Date.now()
          }
        }
      });
    }

    return messagesList;
  }, [baseMessages, latestMessageId, streamingContent, status, processingStage, selectedSessionId, fileIdFromUrl]);

  const handleSendMessage = async (message: string, fileId?: string | null) => {
    if (!message.trim() && !fileId) return;

    try {
      setIsCreatingSession(true);
      
      let currentSessionId = selectedSessionId;
      
      if (!currentSessionId) {
        const newSession = await createSession.mutateAsync();
        currentSessionId = newSession.session_id;
        
        const queryParams = new URLSearchParams();
        queryParams.set('sessionId', currentSessionId);
        if (fileId || uploadedFileId || fileIdFromUrl) {
          queryParams.set('fileId', fileId || uploadedFileId || fileIdFromUrl!);
        }
        navigate(`/chat?${queryParams.toString()}`);
      }

      await sendMessageMutation.mutateAsync({
        content: message,
        fileId: fileId || uploadedFileId || fileIdFromUrl,
        sessionId: currentSessionId
      });

      resetUpload();
    } catch (error) {
      console.error('Send message error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive"
      });
      await queryClient.invalidateQueries({ queryKey: ['chat-messages', selectedSessionId] });
    } finally {
      setIsCreatingSession(false);
    }
  };

  const activeFileId = uploadedFileId || fileIdFromUrl;
  
  const currentFile = selectedFile || (uploadedFile ? {
    filename: uploadedFile.name,
    file_size: uploadedFile.size
  } : null);

  const showMessages = selectedSessionId || isCreatingSession;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50">
        <div className="fixed left-0 top-0 h-full z-10">
          <ChatSidebar />
        </div>
        <div className="flex-1 flex flex-col transition-all duration-200 ml-[60px] sidebar-expanded:ml-[300px]">
          <AnimatePresence mode="wait">
            {!showMessages ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-grow flex items-center justify-center px-4 lg:px-6"
              >
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
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-grow flex flex-col h-[calc(100vh-80px)]"
              >
                <div className="w-full mx-auto max-w-7xl flex-grow flex flex-col px-4 lg:px-6 pt-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-grow flex flex-col overflow-hidden bg-white rounded-xl shadow-sm border border-gray-100 mb-24"
                  >
                    <ChatContent
                      messages={messages}
                      isLoading={messagesLoading}
                      formatTimestamp={formatTimestamp}
                      groupMessagesByDate={groupMessagesByDate}
                      latestMessageId={latestMessageId}
                      status={status}
                    />
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
          </AnimatePresence>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Chat;
