
import React from 'react';
import { FileUploadZone } from '@/components/FileUploadZone';
import { FilesList } from '@/components/FilesList';
import { useSimpleFileUpload } from '@/hooks/useSimpleFileUpload';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChatSidebar } from '@/components/ChatSidebar';
import { SidebarProvider } from '@/components/ui/sidebar-new';

const Files = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    file,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
  } = useSimpleFileUpload();

  const { data: files, isLoading: isLoadingFiles } = useQuery({
    queryKey: ['excel-files'],
    queryFn: async () => {
      const { data: files, error } = await supabase
        .from('excel_files')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        toast({
          title: "Error fetching files",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      return files;
    },
  });

  const onFileUploadComplete = async () => {
    // Invalidate the query to refresh the file list
    await queryClient.invalidateQueries({ queryKey: ['excel-files'] });
    // Reset the upload state for the next file
    resetUpload();
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <ChatSidebar />
        <main className="flex-1">
          <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">My Files</h1>
            <div className="space-y-6">
              <FileUploadZone 
                onFileUpload={handleFileUpload}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                currentFile={file}
                onReset={resetUpload}
                onUploadComplete={onFileUploadComplete}
              />
              <FilesList 
                files={files || []}
                isLoading={isLoadingFiles}
              />
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Files;
