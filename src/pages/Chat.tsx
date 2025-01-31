import { useState, useCallback } from "react";
import { BarChart2, Table2, FileSpreadsheet, Upload } from "lucide-react";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { FileUploadZone } from "@/components/FileUploadZone";
import { ExcelPreview } from "@/components/ExcelPreview";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

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
      <div className="flex min-h-screen w-full bg-gray-900 text-white">
        <AppSidebar />
        <div className="flex-1">
          <nav className="bg-gray-900/50 backdrop-blur-sm fixed top-0 w-full z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16 items-center">
                <div className="flex-1 text-center">
                  <h1 className="text-xl font-bold text-excel font-bricolage">New Chat</h1>
                </div>
              </div>
            </div>
          </nav>

          <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="bg-blue-900/20 backdrop-blur-sm rounded-3xl p-8 shadow-xl">
                <div className="text-center mb-12">
                  <h2 className="text-3xl font-bold mb-4">
                    What do you need help analyzing?
                  </h2>
                  <div className="max-w-2xl mx-auto">
                    <FileUploadZone
                      onFileUpload={handleFileUpload}
                      isUploading={isUploading}
                      uploadProgress={uploadProgress}
                      currentFile={currentFile}
                      onReset={handleReset}
                    />
                    
                    {currentFile && (
                      <div className="mt-8">
                        <ExcelPreview file={currentFile} />
                      </div>
                    )}

                    {messages && messages.length > 0 && (
                      <div className="mt-8 space-y-4 text-left">
                        {messages.map((message) => (
                          <div
                            key={message.id}
                            className={`p-4 rounded-lg ${
                              message.is_ai_response
                                ? "bg-blue-900/30 ml-4"
                                : "bg-gray-800/50 mr-4"
                            }`}
                          >
                            {message.content}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-8">
                      <PlaceholdersAndVanishInput
                        placeholders={placeholders}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onSubmit={handleSubmit}
                        value={searchQuery}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Chat;