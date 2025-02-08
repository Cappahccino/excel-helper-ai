
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

  const shouldShowUploadZone = !selectedSessionId || !sessionFile;
  const currentFile = sessionFile || (uploadedFile ? {
    filename: uploadedFile.name,
    file_size: uploadedFile.size,
  } : null);

  const shouldShowChat = selectedSessionId || activeFileId;

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
                {shouldShowUploadZone && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="mb-8"
                  >
                    <div className="text-center mb-6">
                      <p className="text-lg text-gray-600">
                        Hello! Upload an Excel file and I'll help you analyze it.
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
              {shouldShowChat ? (
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
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-0 left-0 right-0 max-w-4xl mx-auto px-4 pb-4"
                >
                  <div className="flex gap-2 items-center w-full bg-white rounded-lg border shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-300 p-2">
                    <input
                      type="text"
                      placeholder="Ask a question about your Excel file..."
                      className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-sm placeholder:text-gray-400"
                      disabled={!activeFileId}
                    />
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
