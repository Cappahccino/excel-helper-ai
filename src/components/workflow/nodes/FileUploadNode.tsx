
import { useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Search, Upload, Check, X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useFileUpload } from '@/hooks/useFileUpload';
import { NodeProps, FileUploadNodeData } from '@/types/workflow';
import { ChatFilePreview } from '@/components/chat/ChatFilePreview';

interface FileUploadNodeProps extends NodeProps<FileUploadNodeData> {}

export default function FileUploadNode({ id, data, selected }: FileUploadNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filePreviewData, setFilePreviewData] = useState<{ headers: string[], data: any[] }>({ headers: [], data: [] });
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const { handleFileUpload, isUploading, fileIds, error } = useFileUpload();
  
  // Fetch available files from the database
  const { data: filesData, isLoading, refetch } = useQuery({
    queryKey: ['excel_files'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('excel_files')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      return data || [];
    }
  });
  
  // Update the node's configuration when a file is selected
  const { mutate: updateNodeConfig } = useMutation({
    mutationFn: async ({ fileId }: { fileId: string }) => {
      // This would be handled by your workflow state management
      console.log('Node config updated with file ID:', fileId);
      // Return the fileId to be used in onSuccess
      return { fileId };
    },
    onSuccess: ({ fileId }) => {
      setIsOpen(false);
      // Here you would update the node configuration
    }
  });
  
  const handleFileSelect = (fileId: string) => {
    updateNodeConfig({ fileId });
  };
  
  const handleFileUploadComplete = useCallback(async () => {
    if (fileIds.length > 0) {
      await refetch();
      handleFileSelect(fileIds[0]);
    }
  }, [fileIds, refetch]);
  
  const loadFilePreview = async (fileId: string) => {
    try {
      setIsPreviewLoading(true);
      
      // Get file metadata and storage path
      const { data: fileData, error: fileError } = await supabase
        .from('excel_files')
        .select('*')
        .eq('id', fileId)
        .single();
        
      if (fileError) throw fileError;
      
      // Here you would fetch a preview of the file data
      // For this example, we'll just use placeholder data
      const previewData = {
        headers: ['Column1', 'Column2', 'Column3'],
        data: [
          { Column1: 'Data1', Column2: 'Data2', Column3: 'Data3' },
          { Column1: 'Data4', Column2: 'Data5', Column3: 'Data6' },
          { Column1: 'Data7', Column2: 'Data8', Column3: 'Data9' },
        ]
      };
      
      setFilePreviewData(previewData);
    } catch (error) {
      console.error('Error loading file preview:', error);
    } finally {
      setIsPreviewLoading(false);
    }
  };
  
  const filteredFiles = filesData?.filter(file => 
    file.filename.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];
  
  const selectedFile = data?.config?.fileId ? 
    filesData?.find(file => file.id === data.config.fileId) : 
    null;
  
  return (
    <div className={`relative p-3 rounded-md border ${selected ? 'border-blue-500 shadow-md' : 'border-gray-300'}`}>
      <div className="flex items-center mb-2">
        <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center mr-2">
          <Upload className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{data?.label || 'File Upload'}</div>
          {selectedFile && (
            <div className="text-xs text-gray-500 truncate">{selectedFile.filename}</div>
          )}
        </div>
      </div>
      
      <div className="mt-1 flex items-center">
        <Button 
          onClick={() => setIsOpen(true)} 
          variant="outline" 
          size="sm" 
          className="w-full text-xs"
        >
          {selectedFile ? 'Change File' : 'Select File'}
        </Button>
      </div>
      
      {/* Node handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="w-3 h-3 bg-blue-500"
      />
      
      {/* File Select Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Select a File</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="existing">
            <TabsList className="w-full">
              <TabsTrigger value="existing" className="flex-1">Use Existing File</TabsTrigger>
              <TabsTrigger value="upload" className="flex-1">Upload New File</TabsTrigger>
            </TabsList>
            
            <TabsContent value="existing" className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search files by name"
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <ScrollArea className="h-[300px] rounded-md border p-2">
                {isLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-blue-500 rounded-full" />
                  </div>
                ) : filteredFiles.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    No files found. Try uploading a new file.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredFiles.map((file) => (
                      <div 
                        key={file.id}
                        className={`p-3 rounded-md hover:bg-gray-100 cursor-pointer transition-colors flex items-center ${
                          data?.config?.fileId === file.id ? 'bg-blue-50 border border-blue-200' : 'border'
                        }`}
                        onClick={() => {
                          handleFileSelect(file.id);
                          loadFilePreview(file.id);
                        }}
                      >
                        <div className="mr-3">
                          {data?.config?.fileId === file.id ? (
                            <Check className="h-5 w-5 text-blue-500" />
                          ) : (
                            <div className="h-5 w-5" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{file.filename}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(file.created_at).toLocaleDateString()}
                            <span className="mx-1">•</span>
                            {Math.round(file.file_size / 1024)} KB
                          </div>
                        </div>
                        
                        <Badge variant="outline" className="ml-2">
                          {file.mime_type.split('/')[1]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              
              {data?.config?.fileId && (
                <div className="border rounded-md overflow-hidden">
                  <ChatFilePreview 
                    fileId={data.config.fileId}
                    isLoading={isPreviewLoading}
                    headers={filePreviewData.headers}
                    data={filePreviewData.data}
                  />
                </div>
              )}
              
              <div className="flex justify-end">
                <Button onClick={() => setIsOpen(false)}>Close</Button>
              </div>
            </TabsContent>
            
            <TabsContent value="upload" className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-md p-6 transition-colors hover:border-gray-400">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFileUpload(Array.from(e.target.files));
                    }
                  }}
                  accept=".xlsx,.xls,.csv"
                />
                <label htmlFor="file-upload" className="cursor-pointer block text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="mt-2 text-sm font-medium">
                    {isUploading ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-blue-500 rounded-full mr-2" />
                        Uploading...
                      </div>
                    ) : (
                      <>
                        <span className="text-blue-500">Click to upload</span> or drag and drop
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Excel or CSV files only (max 100MB)
                  </p>
                </label>
              </div>
              
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm flex items-center">
                  <X className="h-4 w-4 mr-2" />
                  {error}
                </div>
              )}
              
              {fileIds.length > 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-600 text-sm flex items-center">
                  <Check className="h-4 w-4 mr-2" />
                  File uploaded successfully!
                  <Button 
                    onClick={handleFileUploadComplete} 
                    variant="link"
                    className="ml-auto text-green-600"
                  >
                    Use this file
                  </Button>
                </div>
              )}
              
              <div className="flex justify-end">
                <Button onClick={() => setIsOpen(false)}>Close</Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
