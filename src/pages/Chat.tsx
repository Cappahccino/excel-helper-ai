
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
import { FileInfo } from "@/components/FileInfo";

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

  // Get the current active file ID (either from session or upload)
  const activeFileId = sessionFile?.id || uploadedFileId;

  const shouldShowUploadZone = !selectedSessionId || !sessionFile;
  const shouldShowPreview = (uploadedFile && !isUploading) || sessionFile;
  const currentFile = sessionFile || (uploadedFile ? {
    filename: uploadedFile.name,
    file_size: uploadedFile.size,
  } : null);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <ChatSidebar />
        <div className="flex-1 p-4 space-y-4">
          <div className="w-full max-w-4xl mx-auto">
            {currentFile && (
              <FileInfo 
                filename={currentFile.filename}
                fileSize={currentFile.file_size}
              />
            )}
            {shouldShowUploadZone && (
              <FileUploadZone
                onFileUpload={onFileUpload}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                currentFile={uploadedFile}
                onReset={resetUpload}
              />
            )}
          </div>

          <div className="w-full max-w-4xl mx-auto space-y-4">
            {shouldShowPreview && (
              <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-4 max-h-[40vh] overflow-y-auto">
                  <ExcelPreview file={uploadedFile} />
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border">
              <div className="h-[calc(100vh-24rem)] flex flex-col">
                <div className="flex-1 min-h-0">
                  <ChatWindow 
                    sessionId={selectedSessionId}
                    fileId={activeFileId}
                    onMessageSent={() => {
                      // Refresh the session file query after a message is sent
                      // in case the file association has changed
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Chat;
