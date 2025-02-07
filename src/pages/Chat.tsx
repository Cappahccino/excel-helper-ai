
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
  const selectedThreadId = searchParams.get('thread');

  const {
    file: uploadedFile,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileId,
    threadId,
  } = useFileUpload();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <ChatSidebar />
        <div className="flex-1">
          <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border">
            <div className="h-[calc(100vh-4rem)] flex flex-col">
              <div className="flex flex-col space-y-4 p-4 max-h-[40vh]">
                <FileUploadZone
                  onFileUpload={handleFileUpload}
                  isUploading={isUploading}
                  uploadProgress={uploadProgress}
                  currentFile={uploadedFile}
                  onReset={resetUpload}
                />

                {uploadedFile && !isUploading && (
                  <div className="w-full">
                    <ExcelPreview file={uploadedFile} />
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0">
                <ChatWindow 
                  threadId={selectedThreadId} 
                  fileId={fileId}
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
