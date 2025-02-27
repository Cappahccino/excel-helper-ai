
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
import { MessageCircle } from "lucide-react";
import TabContent from "@/components/chat/TabContent";

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
    files,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileIds
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

    if (status === 'processing' && !latestMessageId && !streamingContent && selectedSessionId) {
      messagesList.unshift({
        id: 'loading-indicator',
        content: '',
        role: 'assistant',
        session_id: selectedSessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'processing',
        is_ai_response: true,
        version: '1.0.0',
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
  }, [baseMessages, latestMessageId, streamingContent, status, processingStage, selectedSessionId]);

  const handleSendMessage = async (message: string, fileIds?: string[] | null) => {
    if (!message.trim() && !fileIds?.length) return;

    try {
      setIsCreatingSession(true);
      
      let currentSessionId = selectedSessionId;
      let shouldNavigate = false;
      let queryParams = new URLSearchParams(location.search);
      
      if (!currentSessionId) {
        console.log('Creating new session...');
        const newSession = await createSession.mutateAsync();
        currentSessionId = newSession.session_id;
        shouldNavigate = true;
        
        queryParams = new URLSearchParams();
        queryParams.set('sessionId', currentSessionId);
        if (fileIds?.length) {
          queryParams.set('fileId', fileIds[0]);
        }
      }

      console.log('Sending message to session:', currentSessionId);
      await sendMessageMutation.mutateAsync({
        content: message,
        fileIds: fileIds || [],
        sessionId: currentSessionId
      });

      if (shouldNavigate) {
        console.log('Navigating to new session...');
        navigate(`/chat?${queryParams.toString()}`);
      }

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

  const activeFileId = fileIds[0] || fileIdFromUrl;
  
  const currentFile = selectedFile || (files[0] ? {
    filename: files[0].name,
    file_size: files[0].size
  } : null);

  const showMessages = selectedSessionId || isCreatingSession;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="fixed left-0 top-0 h-full z-10">
          <ChatSidebar />
        </div>
        <div className="flex-1 flex flex-col transition-all duration-300 ease-in-out ml-[60px] sidebar-expanded:ml-[300px]">
          <AnimatePresence mode="wait">
            {!showMessages ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="flex-grow flex items-center justify-center px-4 lg:px-6"
              >
                <div className="w-full max-w-3xl mx-auto">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-center mb-8"
                  >
                    <div className="flex justify-center mb-6">
                      <div className="p-4 rounded-full bg-green-100">
                        <MessageCircle className="w-8 h-8 text-green-600" />
                      </div>
                    </div>
                    <h2 className="text-3xl font-semibold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent mb-4">
                      Welcome to Excel Assistant
                    </h2>
                    <p className="text-gray-600 text-lg max-w-xl mx-auto">
                      Ask me anything about Excel, or upload a file for analysis using the paperclip button below.
                    </p>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="backdrop-blur-sm bg-white/80 rounded-xl shadow-lg border border-gray-100"
                  >
                    <ChatInput
                      onSendMessage={handleSendMessage}
                      sessionId={selectedSessionId}
                      isAnalyzing={status === 'processing'}
                      fileInfo={currentFile}
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mt-8"
                  >
                    <TabContent />
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
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex-grow flex flex-col overflow-hidden bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100/50 mb-24"
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
                <div className="fixed bottom-0 left-[60px] right-0 transition-all duration-300 ease-in-out sidebar-expanded:left-[300px]">
                  <div className="w-full max-w-7xl mx-auto px-4 pb-4">
                    <div className="backdrop-blur-md bg-white/80 shadow-lg rounded-xl border border-gray-100/50">
                      <ChatInput
                        onSendMessage={handleSendMessage}
                        sessionId={selectedSessionId}
                        isAnalyzing={status === 'processing'}
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
