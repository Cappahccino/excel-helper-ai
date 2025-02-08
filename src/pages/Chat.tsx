import { FileUploadZone } from "@/components/FileUploadZone";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SidebarProvider } from "@/components/ui/sidebar-new";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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

  const {
    file: uploadedFile,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileId: uploadedFileId,
  } = useFileUpload();

  const { data: sessionFile } = useQuery({
    queryKey: ['session-file', selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) return null;
      
      const { data, error } = await supabase
        .from('excel_files')
        .select(`
          *,
          chat_sessions:session_id (
            thread_id
          )
        `)
        .eq('session_id', selectedSessionId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSessionId,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['chat-messages', sessionFile?.session_id],
    queryFn: async () => {
      if (!sessionFile?.session_id) return [];
      
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, excel_files(filename, file_size)')
        .eq('session_id', sessionFile.session_id)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!sessionFile?.session_id,
  });

  useEffect(() => {
    if (!selectedSessionId) {
      resetUpload();
    }
  }, [selectedSessionId, resetUpload]);

  const onFileUpload = async (file: File) => {
    await handleFileUpload(file, selectedSessionId);
  };

  const activeFileId = sessionFile?.id || uploadedFileId;
  const currentFile = sessionFile || (uploadedFile ? {
    filename: uploadedFile.name,
    file_size: uploadedFile.size,
  } : null);

  const showChatWindow = true;
  const showUploadZone = !selectedSessionId && !activeFileId;

  const handleSendMessage = async (message: string, file?: File) => {
    if (!message.trim() && !file) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: analysis, error } = await supabase.functions
      .invoke('excel-assistant', {
        body: { 
          fileId: activeFileId, 
          query: message,
          userId: user.id,
          threadId: sessionFile?.chat_sessions?.thread_id,
          sessionId: sessionFile?.session_id
        }
      });

    if (error) throw error;
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
                    {!selectedSessionId && (
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-gray-600">
                          Hello! You can ask me questions directly, or upload an Excel file for analysis.
                        </p>
                        {showUploadZone && (
                          <div className="mt-4">
                            <FileUploadZone
                              onFileUpload={onFileUpload}
                              isUploading={isUploading}
                              uploadProgress={uploadProgress}
                              currentFile={uploadedFile}
                              onReset={resetUpload}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {messages.map((msg) => (
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
          </motion.div>

          <div className="fixed bottom-0 left-[60px] right-0 transition-all duration-200 sidebar-expanded:left-[300px]">
            <div className="w-full max-w-7xl mx-auto px-4 pb-4">
              <div className="backdrop-blur-sm bg-white/80 shadow-lg rounded-xl py-4">
                <ChatInput 
                  onSendMessage={handleSendMessage}
                  isAnalyzing={false}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Chat;
