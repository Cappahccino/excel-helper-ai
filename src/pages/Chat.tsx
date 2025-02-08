
import { ExcelPreview } from "@/components/ExcelPreview";
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
  const shouldShowPreview = (uploadedFile && !isUploading) || sessionFile;
  const currentFile = sessionFile || (uploadedFile ? {
    filename: uploadedFile.name,
    file_size: uploadedFile.size,
  } : null);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50">
        <ChatSidebar />
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 p-4 lg:p-6 space-y-4 overflow-hidden"
        >
          <div className="w-full mx-auto">
            <AnimatePresence mode="wait">
              {shouldShowUploadZone && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.2 }}
                >
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

          <div className="w-full mx-auto space-y-4">
            <AnimatePresence mode="wait">
              {shouldShowPreview && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white rounded-xl shadow-sm border border-gray-100"
                >
                  <div className="p-4 max-h-[40vh] overflow-y-auto custom-scrollbar">
                    <ExcelPreview file={uploadedFile} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-xl shadow-sm border border-gray-100"
            >
              <div className="h-[calc(100vh-8rem)] flex flex-col">
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
          </div>
        </motion.div>
      </div>
    </SidebarProvider>
  );
};

export default Chat;
