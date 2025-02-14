
import { FileUploadZone } from "@/components/FileUploadZone";
import { useChatFileUpload } from "@/hooks/useChatFileUpload";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SidebarProvider } from "@/components/ui/sidebar-new";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { MessageContent } from "@/components/MessageContent";
import { ChatInput } from "@/components/ChatInput";
import { format } from "date-fns";

const Chat = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const selectedSessionId = searchParams.get('thread');
  const fileIdFromUrl = searchParams.get('fileId');
  const queryClient = useQueryClient();

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

  const { data: session } = useQuery({
    queryKey: ['chat-session', selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) return null;
      const { data, error } = await supabase
        .from('chat_sessions')
        .select(`
          *,
          excel_files (
            id,
            filename,
            file_size
          )
        `)
        .eq('session_id', selectedSessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSessionId
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['chat-messages', selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) return [];
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, excel_files(filename, file_size)')
        .eq('session_id', selectedSessionId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSessionId
  });

  useEffect(() => {
    if (!selectedSessionId) {
      // Only reset upload when changing sessions, not after successful upload
      resetUpload();
    }
  }, [selectedSessionId, resetUpload]);

  const onFileUpload = async (file: File) => {
    await handleFileUpload(file, selectedSessionId);
  };

  const onUploadComplete = () => {
    queryClient.invalidateQueries({
      queryKey: ['chat-messages', selectedSessionId]
    });
    queryClient.invalidateQueries({
      queryKey: ['chat-session', selectedSessionId]
    });
    // Don't reset upload here anymore
  };

  const activeFileId = session?.excel_files?.[0]?.id || uploadedFileId || fileIdFromUrl;
  
  const currentFile = session?.excel_files?.[0] || selectedFile || (uploadedFile ? {
    filename: uploadedFile.name,
    file_size: uploadedFile.size
  } : null);

  const showChatWindow = true;
  const showUploadZone = !selectedSessionId && !activeFileId;

  const handleSendMessage = async (message: string, fileId?: string | null) => {
    if (!message.trim() && !fileId) return;
    
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { data: analysis, error } = await supabase.functions.invoke('excel-assistant', {
        body: {
          fileId: fileId || activeFileId,
          query: message,
          userId: user.id,
          threadId: session?.thread_id,
          sessionId: session?.session_id
        }
      });

      if (error) throw error;

      // Only reset the upload after the message is successfully sent
      resetUpload();
      
      queryClient.invalidateQueries({
        queryKey: ['chat-messages', session?.session_id]
      });
      queryClient.invalidateQueries({
        queryKey: ['chat-session', selectedSessionId, fileId]
      });
    } catch (error) {
      console.error('Analysis error:', error);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return format(new Date(timestamp), 'MMM d, yyyy HH:mm');
  };

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
                    isAnalyzing={false}
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
                      isAnalyzing={false}
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
};

export default Chat;
