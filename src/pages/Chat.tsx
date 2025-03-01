
// Update the import path for OptimisticMessage
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUploadZone } from "@/components/FileUploadZone";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SidebarProvider } from "@/components/ui/sidebar-new";
import { motion, AnimatePresence } from "framer-motion";
import { ChatInput } from "@/components/ChatInput";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { Message } from "@/types/chat";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChatContent } from "@/components/chat/ChatContent";
import { MessageCircle, Loader2, FilePlus, Save, X, Edit2 } from "lucide-react";
import TabContent from "@/components/chat/TabContent";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OptimisticMessage } from "@/components/OptimisticMessage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMediaQuery } from "@/hooks/use-media-query";

const Chat = () => {
  // State and refs
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Hooks
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = new URLSearchParams(location.search);
  const selectedSessionId = searchParams.get('sessionId');
  const fileIdFromUrl = searchParams.get('fileId');

  // File upload hook
  const {
    files,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileIds
  } = useChatFileUpload();

  // Selected file query
  const { data: selectedFile, isLoading: fileLoading } = useQuery({
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

  // Chat messages hook
  const {
    messages: baseMessages,
    isLoading: messagesLoading,
    sendMessage: sendMessageMutation,
    createSession,
    formatTimestamp,
    groupMessagesByDate,
    refetch,
    hasNextPage,
    fetchNextPage
  } = useChatMessages(selectedSessionId);

  // Message update handler
  const handleAssistantMessage = useCallback((message: Message) => {
    console.log('Assistant message updated:', message);
  }, []);

  // Realtime updates hook
  const { status, latestMessageId, processingStage, content: streamingContent } = useChatRealtime({
    sessionId: selectedSessionId,
    refetch,
    onAssistantMessage: handleAssistantMessage
  });

  // Process messages including live updates
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0 && chatContainerRef.current && !isInitialLoad.current) {
      const chatContainer = chatContainerRef.current;
      const scrollElement = chatContainer.querySelector('[data-radix-scroll-area-viewport]');
      
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
    
    if (isInitialLoad.current && messages.length > 0) {
      isInitialLoad.current = false;
    }
  }, [messages.length]);

  // Load more messages when scrolling up
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!hasNextPage || messagesLoading) return;
    
    const target = e.target as HTMLDivElement;
    if (target.scrollTop === 0) {
      const scrollPosition = target.scrollHeight;
      
      fetchNextPage().then(() => {
        if (target.scrollHeight !== scrollPosition) {
          target.scrollTop = target.scrollHeight - scrollPosition;
        }
      });
    }
  }, [fetchNextPage, hasNextPage, messagesLoading]);

  // Send message handler
  const handleSendMessage = async (message: string, fileIds?: string[] | null, tagNames?: string[] | null) => {
    if (!message.trim() && !fileIds?.length) return;

    try {
      setIsCreatingSession(true);
      
      let currentSessionId = selectedSessionId;
      let shouldNavigate = false;
      let queryParams = new URLSearchParams(location.search);
      
      // Create new session if needed
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
        
        // If session was named, update it
        if (sessionName.trim()) {
          try {
            await supabase
              .from('chat_sessions')
              .update({ 
                chat_name: sessionName.trim(),
                thread_metadata: { title: sessionName.trim(), summary: null }
              })
              .eq('session_id', currentSessionId);
          } catch (error) {
            console.error('Failed to update session name:', error);
          }
        }
      }

      // Send the message
      console.log('Sending message to session:', currentSessionId);
      await sendMessageMutation.mutateAsync({
        content: message,
        fileIds: fileIds || [],
        tagNames: tagNames || [],
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

  // Drag and drop file handling
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      await handleFileUpload(files, selectedSessionId);
    }
  };

  // Handle file input change
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      await handleFileUpload(files, selectedSessionId);
    }
  };

  // Create new session dialog
  const handleCreateNewSession = () => {
    setSessionName("");
    setIsSessionDialogOpen(true);
  };

  const handleSessionCreate = () => {
    setIsSessionDialogOpen(false);
    // Reset state for new chat
    resetUpload();
    navigate("/chat");
  };

  const activeFileId = fileIds[0] || fileIdFromUrl;
  
  const currentFile = selectedFile || (files[0] ? {
    filename: files[0].name,
    file_size: files[0].size
  } : null);

  const showMessages = selectedSessionId || isCreatingSession;
  const isLoading = messagesLoading || fileLoading || isCreatingSession;

  return (
    <SidebarProvider>
      <div 
        className="flex min-h-screen w-full bg-gradient-to-br from-gray-50 to-gray-100"
        onDragEnter={handleDragEnter}
      >
        {/* Drag overlay */}
        {dragActive && (
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center"
            onDragLeave={handleDragLeave}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="bg-white rounded-xl p-8 shadow-2xl border-2 border-dashed border-excel animate-pulse">
              <FilePlus className="w-16 h-16 text-excel mb-4 mx-auto" />
              <p className="text-xl font-medium text-center">Drop your Excel files here</p>
            </div>
          </div>
        )}

        {/* Sidebar */}
        <div className="fixed left-0 top-0 h-full z-10">
          <ChatSidebar />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col transition-all duration-300 ease-in-out ml-[60px] sidebar-expanded:ml-[300px]">
          {/* Session name dialog */}
          <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New Conversation</DialogTitle>
                <DialogDescription>
                  Give your conversation a name to help you find it later
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Input
                  placeholder="e.g. Q1 Sales Analysis"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsSessionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSessionCreate}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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

                  {/* Actions buttons for new session */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="flex flex-wrap gap-4 justify-center mb-6"
                  >
                    <Button 
                      variant="outline" 
                      className="gap-2"
                      onClick={handleCreateNewSession}
                    >
                      <FilePlus className="w-4 h-4" />
                      New Conversation
                    </Button>
                    <Button 
                      variant="outline" 
                      className="gap-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileInputChange}
                        accept=".xlsx,.xls,.csv"
                        multiple
                      />
                      <FilePlus className="w-4 h-4" />
                      Upload Excel File
                    </Button>
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
                {/* Chat header */}
                <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100/50 p-2 sm:p-4 flex items-center justify-between sticky top-0 z-10">
                  <div className="flex items-center gap-3">
                    {isLoading ? (
                      <Skeleton className="h-5 w-40" />
                    ) : (
                      <h1 className="font-medium truncate max-w-[200px] sm:max-w-xs">
                        {selectedSessionId ? (
                          messages[0]?.message_files?.[0]?.filename || "Conversation"
                        ) : (
                          "New Conversation"
                        )}
                      </h1>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isMobile && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="gap-1"
                        onClick={handleCreateNewSession}
                      >
                        <FilePlus className="h-4 w-4" />
                        <span className="hidden sm:inline">New Chat</span>
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="gap-1" 
                      onClick={() => fileInputRef.current?.click()}>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileInputChange}
                        accept=".xlsx,.xls,.csv"
                        multiple
                      />
                      <FilePlus className="h-4 w-4" />
                      <span className="hidden sm:inline">Upload</span>
                    </Button>
                  </div>
                </div>

                <div 
                  className="w-full mx-auto max-w-7xl flex-grow flex flex-col px-4 lg:px-6 pt-4"
                  ref={chatContainerRef}
                >
                  {isLoading && messages.length === 0 ? (
                    <div className="flex-grow flex flex-col overflow-hidden bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100/50 mb-24 p-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex gap-3 mb-6 animate-pulse">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="flex-1">
                            <Skeleton className="h-4 w-32 mb-2" />
                            <Skeleton className="h-16 w-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex-grow flex flex-col overflow-hidden bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100/50 mb-24"
                    >
                      <ScrollArea 
                        className="flex-1 h-full p-4" 
                        onScroll={handleScroll}
                        data-chat-container
                      >
                        <ChatContent
                          messages={messages}
                          isLoading={messagesLoading}
                          formatTimestamp={formatTimestamp}
                          groupMessagesByDate={groupMessagesByDate}
                          latestMessageId={latestMessageId}
                          status={status}
                        />
                      </ScrollArea>
                    </motion.div>
                  )}
                </div>

                {/* Input area */}
                <div className="fixed bottom-0 left-[60px] right-0 transition-all duration-300 ease-in-out sidebar-expanded:left-[300px]">
                  <div className="w-full max-w-7xl mx-auto px-4 pb-4">
                    <div className="backdrop-blur-md bg-white/90 shadow-lg rounded-xl border border-gray-100/50">
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
