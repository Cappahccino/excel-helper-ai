
import React, { useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Upload, Database, FileSpreadsheet, Search, Plus, X, Check } from 'lucide-react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tab, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUploadZone } from '@/components/FileUploadZone';
import { NodeProps } from '@/types/workflow';
import { useToast } from '@/hooks/use-toast';
import { useFileUpload } from '@/hooks/useFileUpload';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { ExcelFile } from '@/types/files';
import { formatDistanceToNow } from 'date-fns';
import { ExcelPreview } from '@/components/ExcelPreview';

interface FileUploadNodeData {
  label: string;
  type: string;
  config: {
    fileId?: string;
    fileName?: string;
    hasHeaders?: boolean;
    sheet?: string;
  };
}

const FileUploadNode: React.FC<NodeProps<FileUploadNodeData>> = ({ data, selected, id }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('existing');
  const { toast } = useToast();
  
  // Use simplified file upload hook
  const {
    files,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
  } = useFileUpload();

  // Create a safe default data object if none is provided
  const nodeData = data || {
    label: 'File Upload',
    type: 'fileUpload',
    config: {}
  };

  // Fetch existing files
  const { data: existingFiles, isLoading, refetch } = useQuery({
    queryKey: ['excel-files-for-node', searchTerm],
    queryFn: async () => {
      const { data: files, error } = await supabase
        .from('excel_files')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .ilike('filename', `%${searchTerm}%`);

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

  // Handler for selecting a file
  const handleSelectFile = useCallback((file: ExcelFile) => {
    if (!id) return;
    
    // Update node data with selected file
    const updatedNodeData = {
      ...nodeData,
      config: {
        ...nodeData.config,
        fileId: file.id,
        fileName: file.filename
      }
    };
    
    // This is a placeholder - in a real implementation, we would update the node data
    console.log('Selected file:', file);
    console.log('Updated node data:', updatedNodeData);
    
    // Close the dialog
    setIsDialogOpen(false);
    
    toast({
      title: "File Selected",
      description: `${file.filename} has been selected.`,
    });
  }, [id, nodeData, toast]);

  // Handle file upload completion
  const handleUploadComplete = async () => {
    await refetch();
    resetUpload();
    setActiveTab('existing');
    
    toast({
      title: "Upload Complete",
      description: "File has been uploaded successfully.",
    });
  };

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <>
      <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-green-500 shadow-md' : 'border-green-200'}`}>
        {/* Header */}
        <div className="flex items-center gap-2 bg-green-50 p-2 rounded-t-md">
          <Upload className="h-4 w-4 text-green-500" />
          <div className="text-sm font-medium text-green-800">{nodeData.label}</div>
        </div>
        
        {/* Body */}
        <div className="p-3 pt-2 bg-white rounded-b-md">
          {nodeData.config.fileId ? (
            <div className="text-xs">
              <div className="flex items-center mb-2">
                <FileSpreadsheet className="h-4 w-4 text-green-500 mr-2" />
                <span className="text-gray-700 font-medium truncate">{nodeData.config.fileName || 'Selected file'}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Headers:</span>
                <span>{nodeData.config.hasHeaders ? 'Yes' : 'No'}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsDialogOpen(true)}
                className="w-full mt-2 text-xs h-7"
              >
                Change File
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDialogOpen(true)}
                className="flex items-center text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Select File
              </Button>
              <p className="text-xs text-gray-500 mt-1">No file selected</p>
            </div>
          )}
        </div>
        
        {/* Output handle - bottom center */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="output"
          style={{
            background: nodeData.config.fileId ? '#10b981' : '#d1d5db',
            width: 10,
            height: 10,
            bottom: -5,
          }}
        />
      </div>

      {/* File Selection Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[750px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select or Upload File</DialogTitle>
          </DialogHeader>
          
          <div className="flex-grow overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <TabsList className="grid grid-cols-2 mb-4">
                <TabsTrigger value="existing">Select Existing File</TabsTrigger>
                <TabsTrigger value="upload">Upload New File</TabsTrigger>
              </TabsList>
              
              <TabsContent value="existing" className="flex-grow overflow-hidden flex flex-col">
                <div className="relative mb-4">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search files..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <ScrollArea className="flex-grow border rounded-md">
                  {isLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                    </div>
                  ) : !existingFiles || existingFiles.length === 0 ? (
                    <div className="text-center p-8 text-muted-foreground">
                      <Database className="h-12 w-12 mx-auto opacity-20 mb-4" />
                      <h3 className="font-medium">No files found</h3>
                      <p className="text-sm mt-1">
                        {searchTerm ? 'Try a different search term' : 'Upload a file to get started'}
                      </p>
                      <Button 
                        variant="link" 
                        onClick={() => setActiveTab('upload')}
                        className="mt-2"
                      >
                        Upload a new file
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 p-2">
                      {existingFiles.map((file) => (
                        <div 
                          key={file.id}
                          onClick={() => handleSelectFile(file)}
                          className={`flex items-center p-3 rounded-md border cursor-pointer transition-colors
                            ${nodeData.config.fileId === file.id 
                              ? 'bg-green-50 border-green-300' 
                              : 'hover:bg-gray-50 border-gray-200'}`}
                        >
                          <div className="flex items-center flex-1 min-w-0">
                            <FileSpreadsheet className="h-5 w-5 text-green-500 flex-shrink-0 mr-3" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-700 truncate">
                                {file.filename}
                              </p>
                              <div className="flex text-xs text-gray-500 gap-2">
                                <span>{formatFileSize(file.file_size)}</span>
                                <span>•</span>
                                <span>{formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}</span>
                              </div>
                            </div>
                          </div>
                          
                          {nodeData.config.fileId === file.id && (
                            <Check className="h-5 w-5 text-green-500 ml-2" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                
                {nodeData.config.fileId && (
                  <div className="mt-4 border rounded-md p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium">Selected File Preview</h3>
                      <Button 
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!id) return;
                          // Clear file selection
                          const updatedNodeData = {
                            ...nodeData,
                            config: {
                              ...nodeData.config,
                              fileId: undefined,
                              fileName: undefined
                            }
                          };
                          console.log('Cleared file selection:', updatedNodeData);
                        }}
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Clear selection</span>
                      </Button>
                    </div>
                    <ExcelPreview sessionFileId={nodeData.config.fileId} />
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="upload" className="flex-grow">
                <div className="border rounded-md p-4 h-full flex flex-col">
                  <FileUploadZone
                    onFileUpload={handleFileUpload}
                    isUploading={isUploading}
                    uploadProgress={uploadProgress}
                    currentFiles={files}
                    onReset={resetUpload}
                    onUploadComplete={handleUploadComplete}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FileUploadNode;
