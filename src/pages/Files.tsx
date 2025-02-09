
import React from 'react';
import { FileUploadZone } from '@/components/FileUploadZone';
import { FilesList } from '@/components/FilesList';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AppSidebar } from '@/components/AppSidebar';

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
    <div className="flex h-screen w-full">
      <AppSidebar />
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
            />
            <FilesList 
              files={files || []}
              isLoading={isLoadingFiles}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Files;
