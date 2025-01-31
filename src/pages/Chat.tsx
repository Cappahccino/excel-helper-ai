import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useToast } from "@/hooks/use-toast";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";

const Chat = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileId, setFileId] = useState<string | null>(null);
  const { toast } = useToast();

  const placeholders = [
    "Add a file or start chat...",
    "Summarise the data in my sheet",
    "Sum column C when when rows in Column B equal June",
  ];

  const handleFileUpload = async (file: File) => {
    try {
      setIsUploading(true);
      setCurrentFile(file);

      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Upload file to Supabase Storage
      const filePath = `${crypto.randomUUID()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Create file record in database
      const { data: fileRecord, error: dbError } = await supabase
        .from('excel_files')
        .insert({
          filename: file.name,
          file_path: filePath,
          file_size: file.size,
          user_id: user.id,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setFileId(fileRecord.id);

      // Get initial analysis
      const { data: analysis, error: analysisError } = await supabase.functions
        .invoke('analyze-excel', {
          body: { fileId: fileRecord.id }
        });

      if (analysisError) throw analysisError;

      toast({
        title: "File uploaded successfully",
        description: "Initial analysis complete",
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleReset = () => {
    setCurrentFile(null);
    setFileId(null);
    setUploadProgress(0);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const { data: analysis, error } = await supabase.functions
        .invoke('analyze-excel', {
          body: { fileId, query: searchQuery }
        });

      if (error) throw error;

      toast({
        title: "Analysis complete",
        description: "Your query has been processed",
      });
    } catch (error) {
      console.error('Query error:', error);
      toast({
        title: "Query failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Fetch chat messages
  const { data: messages } = useQuery({
    queryKey: ['chat-messages', fileId],
    queryFn: async () => {
      if (!fileId) return [];
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('excel_file_id', fileId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!fileId,
  });

  return (
    <SidebarProvider>
      <ChatHeader />
      <ChatContainer
        currentFile={currentFile}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        handleFileUpload={handleFileUpload}
        handleReset={handleReset}
      >
        <ChatMessages messages={messages} />
        <ChatInput
          placeholders={placeholders}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          handleSubmit={handleSubmit}
        />
      </ChatContainer>
    </SidebarProvider>
  );
};

export default Chat;