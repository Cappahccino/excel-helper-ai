
import { useLocation, useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SidebarProvider } from "@/components/ui/sidebar-new";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { MessageContent } from "@/components/MessageContent";
import { ChatInput } from "@/components/ChatInput";
import { format } from "date-fns";
import { FileUploadZone } from "@/components/FileUploadZone";
import { useFileUpload } from "@/hooks/useFileUpload";
import { toast } from "@/hooks/use-toast";

const Chat = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const selectedSessionId = searchParams.get('session');
  const queryClient = useQueryClient();

  const {
    file: uploadedFile,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    fileId: uploadedFileId,
  } = useFileUpload();

  // First, get the session details independently
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['chat-session', selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) return null;
      
      const { data, error } = await supabase
        .from('chat_sessions')
        .select(`
          *,
          excel_files (
            id,
            filename,
            file_size
          )
        `)
        .eq('session_id', selectedSessionId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSessionId,
  });

  // Then get messages based on session ID
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['chat-messages', selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) return [];
      
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, excel_files(filename, file_size)')
        .eq('session_id', selectedSessionId)
        .order('created_at', { ascending: true });
      
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

  const handleSendMessage = async (message: string, fileId?: string | null) => {
    if ((!message.trim() && !fileId)) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { data: analysis, error } = await supabase.functions
        .invoke('excel-assistant', {
          body: { 
            fileId: fileId || session?.excel_files?.[0]?.id || uploadedFileId, 
            query: message,
            userId: user.id,
            threadId: session?.thread_id,
            sessionId: session?.session_id
          }
        });

      if (error) throw error;
      
      // Invalidate queries to refresh the messages
      queryClient.invalidateQueries({ queryKey: ['chat-messages', selectedSessionId] });
      queryClient.invalidateQueries({ queryKey: ['chat-session', selectedSessionId] });
      
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze request",
        variant: "destructive",
      });
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return format(new Date(timestamp), 'MMM d, yyyy HH:mm');
  };

  const activeFileId = session?.excel_files?.[0]?.id || uploadedFileId;
  const showUploadZone = !selectedSessionId && !activeFileId;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50">
        <div className="fixed left-0 top-0 h-full z-10">
          <ChatSidebar />
        </div>
        <div className="flex-1 flex flex-col transition-all duration-200 ml-[60px] sidebar-expanded:ml-[300px]">
          {showUploadZone ? (
            <div className="flex-grow flex items-center justify-center px-4 lg:px-6">
              <div className="w-full max-w-3xl mx-auto">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center mb-8"
                >
                  <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                    Welcome to Excel Assistant
                  </h2>
                  <p className="text-gray-600">
                    Ask me anything about Excel, or upload a file for analysis using the paperclip button below.
                  </p>
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <ChatInput 
                    onSendMessage={handleSendMessage}
                    sessionId={selectedSessionId}
                    isAnalyzing={false}
                  />
                </motion.div>
              </div>
            </div>
          ) : (
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
                  {(sessionLoading || messagesLoading) ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
                    </div>
                  ) : (
                    <ScrollArea className="flex-grow p-4">
                      <div className="space-y-6">
                        {messages.map((msg) => (
                          <MessageContent
                            key={msg.id}
                            content={msg.content}
                            role={msg.role as 'user' | 'assistant'}
                            timestamp={formatTimestamp(msg.created_at)}
                            fileInfo={msg.excel_files}
                            sessionId={msg.session_id}
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </motion.div>
              </div>
              <div className="fixed bottom-0 left-[60px] right-0 transition-all duration-200 sidebar-expanded:left-[300px]">
                <div className="w-full max-w-7xl mx-auto px-4 pb-4">
                  <div className="backdrop-blur-sm bg-white/80 shadow-lg rounded-xl py-2">
                    <ChatInput 
                      onSendMessage={handleSendMessage}
                      sessionId={selectedSessionId}
                      isAnalyzing={false}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Chat;
