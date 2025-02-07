
import { ExcelPreview } from "@/components/ExcelPreview";
import { FileUploadZone } from "@/components/FileUploadZone";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useLocation } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SidebarProvider } from "@/components/ui/sidebar-new";
import { ChatWindow } from "@/components/ChatWindow";

const Chat = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const selectedSessionId = searchParams.get('thread');

  const {
    file: uploadedFile,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileId,
  } = useFileUpload();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <ChatSidebar />
        <div className="flex-1 p-4">
          <div className="w-full max-w-4xl mx-auto space-y-4">
            {/* File Upload Zone at the top */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <FileUploadZone
                onFileUpload={handleFileUpload}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                currentFile={uploadedFile}
                onReset={resetUpload}
              />
            </div>

            {/* Excel Preview below upload, only shown when there's a file */}
            {uploadedFile && !isUploading && (
              <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-4 max-h-[40vh] overflow-y-auto">
                  <ExcelPreview file={uploadedFile} />
                </div>
              </div>
            )}

            {/* Chat Window at the bottom */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="h-[calc(100vh-24rem)] flex flex-col">
                <div className="flex-1 min-h-0">
                  <ChatWindow 
                    sessionId={selectedSessionId}
                    fileId={fileId}
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
