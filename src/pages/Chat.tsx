
import { FileUploadZone } from "@/components/FileUploadZone";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SidebarProvider } from "@/components/ui/sidebar-new";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

  useEffect(() => {
    if (!selectedSessionId) {
      resetUpload();
    }
  }, [selectedSessionId, resetUpload]);

  const onFileUpload = async (file: File) => {
    await handleFileUpload(file, selectedSessionId);
  };

  const activeFileId = sessionFile?.id || uploadedFileId;

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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50">
        <div className="fixed left-0 top-0 h-full z-10">
          <ChatSidebar />
        </div>
        <div className="flex-1 flex flex-col transition-all duration-200 ml-[60px] sidebar-expanded:ml-[300px]">
          <div className="flex items-center justify-center min-h-screen">
            <div className="w-full max-w-2xl mx-auto px-4">
              {!selectedSessionId && (
                <div className="text-center mb-6">
                  <p className="text-gray-600 font-semibold">
                    Hello! You can ask me questions directly, or upload an Excel file for analysis using the paperclip button below.
                  </p>
                </div>
              )}
              <div className="backdrop-blur-sm bg-white/80 shadow-lg rounded-xl py-2">
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

