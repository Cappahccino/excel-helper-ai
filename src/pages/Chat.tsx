
import { FileUploadZone } from "@/components/FileUploadZone";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SidebarProvider } from "@/components/ui/sidebar-new";
import { ChatWindow } from "@/components/ChatWindow";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

const Chat = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const selectedSessionId = searchParams.get('thread');
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!message.trim() || !activeFileId || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');
      
      const { data: analysis, error } = await supabase.functions
        .invoke('excel-assistant', {
          body: { 
            fileId: activeFileId, 
            query: message,
            userId: user.id,
            sessionId: selectedSessionId
          }
        });

      if (error) throw error;
      setMessage("");
      
    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

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
                    className="space-y-6"
                  >
                    <div className="text-center">
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
                    
                    {/* Input box below upload zone */}
                    <div className="flex gap-2 items-center w-full bg-white rounded-lg border shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-300 p-2">
                      <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit();
                          }
                        }}
                        placeholder={activeFileId ? "Ask a question about your Excel file..." : "Upload an Excel file to start analyzing"}
                        className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-sm placeholder:text-gray-400"
                        disabled={!activeFileId || isAnalyzing}
                      />
                      <Button 
                        onClick={() => handleSubmit()}
                        size="sm"
                        className="bg-excel hover:bg-excel/90 transition-colors duration-200 shadow-sm h-8 w-8 p-0"
                        disabled={!activeFileId || isAnalyzing}
                      >
                        {isAnalyzing ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              {shouldShowChat && (
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
