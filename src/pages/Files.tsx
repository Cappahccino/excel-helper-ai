
import React, { useState } from 'react';
import { FileUploadZone } from '@/components/FileUploadZone';
import { FilesList } from '@/components/FilesList';
import { useSimpleFileUpload } from '@/hooks/useSimpleFileUpload';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChatSidebar } from '@/components/ChatSidebar';
import { SidebarProvider } from '@/components/ui/sidebar-new';
import { FileStats } from '@/components/files/FileStats';
import { FileActions } from '@/components/files/FileActions';
import { ScrollArea } from "@/components/ui/scroll-area";

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
          // Invalidate the query to refresh the list
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
    const selectedFilesData = files?.filter(file => selectedFiles.includes(file.id)) || [];
    
    try {
      // Soft delete files
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
              <div className="mb-6">
                <div className="flex justify-between items-center mb-6">
                  <h1 className="text-2xl font-bold">My Files</h1>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
                  <FileStats 
                    totalFiles={files?.length || 0}
                    totalStorage={totalStorage}
                  />
                  
                  <FileUploadZone 
                    onFileUpload={handleFileUpload}
                    isUploading={isUploading}
                    uploadProgress={uploadProgress}
                    currentFile={file}
                    onReset={resetUpload}
                    onUploadComplete={onFileUploadComplete}
                  />
                </div>
              </div>

              <div className="flex-grow flex flex-col overflow-hidden bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-4 border-b border-gray-100">
                  <FileActions 
                    onSearch={setSearchQuery}
                    searchQuery={searchQuery}
                    selectedCount={selectedFiles.length}
                    onBulkDownload={handleBulkDownload}
                    onBulkDelete={handleBulkDelete}
                  />
                </div>
                
                <ScrollArea className="flex-grow p-4">
                  <FilesList 
                    files={filteredFiles}
                    isLoading={isLoadingFiles}
                    selectedFiles={selectedFiles}
                    onSelectionChange={setSelectedFiles}
                  />
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Files;
