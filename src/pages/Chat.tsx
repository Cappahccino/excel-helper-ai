import { FileUploadZone } from "@/components/FileUploadZone";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SidebarProvider } from "@/components/ui/sidebar-new";
import { ChatWindow } from "@/components/ChatWindow";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

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
        .select('*')
        .eq('session_id', selectedSessionId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSessionId,
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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50">
        <ChatSidebar />
        <div className="flex-1 transition-all duration-300">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 lg:p-6 space-y-4 h-full relative"
          >
            <div className="w-full mx-auto max-w-4xl">
              <AnimatePresence mode="wait">
                {showUploadZone && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                  >
                    <div className="text-center">
                      <p className="text-lg text-gray-600">
                        Hello! You can ask me questions directly, or upload an Excel file for analysis.
                      </p>
                    </div>
                    <FileUploadZone
                      onFileUpload={onFileUpload}
                      isUploading={isUploading}
                      uploadProgress={uploadProgress}
                      currentFile={uploadedFile}
                      onReset={resetUpload}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              {showChatWindow && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-white rounded-xl shadow-sm border border-gray-100"
                >
                  <div className="h-[calc(100vh-8rem)] flex flex-col relative">
                    <div className="flex-1 min-h-0">
                      <ChatWindow 
                        sessionId={selectedSessionId}
                        fileId={activeFileId}
                        fileInfo={currentFile}
                        onMessageSent={() => {
                          // Refresh the session file query after a message is sent
                          // in case the file association has changed
                        }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Chat;
