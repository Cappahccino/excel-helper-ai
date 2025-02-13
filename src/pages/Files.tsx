
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
import { 
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const Files = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  
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
    await queryClient.invalidateQueries({ queryKey: ['excel-files'] });
    resetUpload();
  };

  const filteredFiles = files?.filter(file => 
    file.filename.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const totalStorage = files?.reduce((acc, file) => acc + file.file_size, 0) || 0;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <ChatSidebar />
        <main className="flex-1 ml-[60px] transition-all duration-200 sidebar-expanded:ml-[300px]">
          <div className="container mx-auto p-6">
            <Breadcrumb className="mb-6">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Home</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Files</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold">My Files</h1>
            </div>

            <FileStats 
              totalFiles={files?.length || 0}
              totalStorage={totalStorage}
            />

            <FileActions 
              onViewChange={setViewMode}
              currentView={viewMode}
              onSearch={setSearchQuery}
              searchQuery={searchQuery}
            />

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
                files={filteredFiles}
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
