
import React from 'react';
import { FileUploadZone } from '@/components/FileUploadZone';
import { FilesList } from '@/components/FilesList';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar-new';

const Files = () => {
  const { toast } = useToast();
  const {
    file,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
  } = useFileUpload();

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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50">
        <div className="fixed left-0 top-0 h-full z-10">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col transition-all duration-200 ml-[60px] sidebar-expanded:ml-[300px]">
          <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">My Files</h1>
            <div className="space-y-6">
              <FileUploadZone 
                onFileUpload={handleFileUpload}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                currentFile={file}
                onReset={resetUpload}
              />
              <FilesList 
                files={files || []}
                isLoading={isLoadingFiles}
              />
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Files;
