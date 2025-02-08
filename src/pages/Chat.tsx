
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

  // Query to get session's file
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

  // Reset file state when navigating to a new chat
  useEffect(() => {
    if (!selectedSessionId) {
      resetUpload();
    }
  }, [selectedSessionId, resetUpload]);

  const onFileUpload = async (file: File) => {
    await handleFileUpload(file, selectedSessionId);
  };

  const activeFileId = sessionFile?.id || uploadedFileId;

  const shouldShowUploadZone = !selectedSessionId || !sessionFile;
  const currentFile = sessionFile || (uploadedFile ? {
    filename: uploadedFile.name,
    file_size: uploadedFile.size,
  } : null);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50">
        <ChatSidebar />
        <div className="flex-1 p-4 lg:p-6 min-h-screen flex flex-col">
          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
            {shouldShowUploadZone && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center gap-6 mb-8"
              >
                <h1 className="text-2xl font-semibold text-gray-900">
                  What do you want to analyze today?
                </h1>
                <div className="w-full">
                  <FileUploadZone
                    onFileUpload={onFileUpload}
                    isUploading={isUploading}
                    uploadProgress={uploadProgress}
                    currentFile={uploadedFile}
                    onReset={resetUpload}
                  />
                </div>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {(activeFileId || selectedSessionId) && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col"
                >
                  <ChatWindow 
                    sessionId={selectedSessionId}
                    fileId={activeFileId}
                    fileInfo={currentFile}
                    onMessageSent={() => {
                      // Refresh the session file query after a message is sent
                      // in case the file association has changed
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Chat;
