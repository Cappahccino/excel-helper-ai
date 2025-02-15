
import React, { useState } from 'react';
import { useSimpleFileUpload } from '@/hooks/useSimpleFileUpload';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChatSidebar } from '@/components/ChatSidebar';
import { SidebarProvider } from '@/components/ui/sidebar-new';
import { FilesHeader } from '@/components/files/FilesHeader';
import { FilesContent } from '@/components/files/FilesContent';

const Files = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  
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
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        toast({
          title: "Error fetching files",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      // Trigger storage verification for unverified files
      const unverifiedFiles = files?.filter(f => !f.storage_verified);
      if (unverifiedFiles?.length > 0) {
        try {
          await supabase.functions.invoke('verify-storage');
          queryClient.invalidateQueries({ queryKey: ['excel-files'] });
        } catch (error) {
          console.error('Storage verification error:', error);
        }
      }

      return files;
    },
  });

  const onFileUploadComplete = async () => {
    await queryClient.invalidateQueries({ queryKey: ['excel-files'] });
    resetUpload();
  };

  const filteredFiles = files?.filter(file => 
    file.filename.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const totalStorage = files?.reduce((acc, file) => acc + file.file_size, 0) || 0;

  const handleBulkDownload = async () => {
    if (!selectedFiles.length) {
      toast({
        title: "No Files Selected",
        description: "Please select files to download",
        variant: "destructive",
      });
      return;
    }

    const selectedFilesData = files?.filter(file => selectedFiles.includes(file.id)) || [];
    
    for (const file of selectedFilesData) {
      try {
        if (!file.storage_verified) {
          toast({
            title: "File Unavailable",
            description: `${file.filename} is not available for download`,
            variant: "destructive",
          });
          continue;
        }

        const { data, error } = await supabase.storage
          .from('excel_files')
          .download(file.file_path);

        if (error) throw error;

        const url = window.URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.filename;
        a.click();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Download error:', error);
        toast({
          title: "Download Failed",
          description: `Failed to download ${file.filename}`,
          variant: "destructive",
        });
      }
    }
    
    toast({
      title: "Downloads Started",
      description: `${selectedFiles.length} files are being downloaded`,
    });
  };

  const handleBulkDelete = async () => {
    if (!selectedFiles.length) {
      toast({
        title: "No Files Selected",
        description: "Please select files to delete",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error: dbError } = await supabase
        .from('excel_files')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', selectedFiles);

      if (dbError) throw dbError;

      toast({
        title: "Files Deleted",
        description: `Successfully deleted ${selectedFiles.length} files`,
      });

      setSelectedFiles([]);
      queryClient.invalidateQueries({ queryKey: ['excel-files'] });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete one or more files",
        variant: "destructive",
      });
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50">
        <div className="fixed left-0 top-0 h-full z-10">
          <ChatSidebar />
        </div>
        <div className="flex-1 flex flex-col transition-all duration-200 ml-[60px] sidebar-expanded:ml-[300px]">
          <div className="flex-grow flex flex-col h-[calc(100vh-80px)]">
            <div className="w-full mx-auto max-w-7xl flex-grow flex flex-col px-4 lg:px-6 pt-4">
              <FilesHeader 
                totalFiles={files?.length || 0}
                totalStorage={totalStorage}
                onFileUpload={handleFileUpload}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                currentFile={file}
                onReset={resetUpload}
                onUploadComplete={onFileUploadComplete}
              />
              
              <FilesContent 
                files={filteredFiles}
                isLoading={isLoadingFiles}
                searchQuery={searchQuery}
                selectedFiles={selectedFiles}
                onSearch={setSearchQuery}
                onSelectionChange={setSelectedFiles}
                onBulkDownload={handleBulkDownload}
                onBulkDelete={handleBulkDelete}
              />
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Files;
