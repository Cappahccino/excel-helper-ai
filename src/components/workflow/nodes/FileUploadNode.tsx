import React, { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileUp, GripVertical, FileText, Search, Upload } from 'lucide-react';
import { NodeProps, FileUploadNodeData } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

// Default data if none is provided
const defaultData: FileUploadNodeData = {
  label: 'File Upload',
  type: 'fileUpload',
  config: {}
};

const FileUploadNode = ({ data, selected }: NodeProps<FileUploadNodeData>) => {
  // Use provided data or fallback to default data
  const nodeData = data || defaultData;
  
  const [files, setFiles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  
  // Function to fetch files from Supabase
  const fetchFiles = async () => {
    try {
      setIsLoading(true);
      
      const { data: fetchedFiles, error } = await supabase
        .from('excel_files')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching files:', error);
        toast({
          title: "Error",
          description: "Failed to load files",
          variant: "destructive",
        });
        return;
      }

      setFiles(fetchedFiles || []);
    } catch (error) {
      console.error('Error in fetchFiles:', error);
      toast({
        title: "Error",
        description: "Failed to load files",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isDialogOpen) {
      fetchFiles();
    }
  }, [isDialogOpen]);

  // Filter files based on search query
  const filteredFiles = files.filter(file => 
    file.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle file selection
  const handleFileSelect = (fileId: string, fileName: string) => {
    if (nodeData && nodeData.config) {
      nodeData.config.fileId = fileId;
      nodeData.config.fileName = fileName;
    }
    setIsDialogOpen(false);
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    try {
      setIsUploading(true);
      
      // Simulate upload progress
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 95) {
            clearInterval(interval);
            return prev;
          }
          return prev + 5;
        });
      }, 100);
      
      // Simulate upload
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      clearInterval(interval);
      setUploadProgress(100);
      
      // In a real implementation, we would upload to Supabase here
      // For now, we'll simulate a successful upload
      
      toast({
        title: "Success",
        description: "File uploaded successfully",
      });
      
      // Update files list
      await fetchFiles();
      
      // Close upload dialog
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setUploadProgress(0);
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Error",
        description: "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Get selected file name
  const selectedFileName = nodeData.config?.fileName || 'Not selected';

  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-blue-500 shadow-md' : 'border-blue-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-blue-500 opacity-50" />
        <FileUp className="h-4 w-4 text-blue-500" />
        <div className="text-sm font-medium text-blue-800">{nodeData.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        <div className="text-xs text-gray-500">
          <div className="flex items-center justify-between mb-1">
            <span>File:</span>
            <span className="font-medium">{nodeData.config?.fileId ? 'Selected' : 'Not selected'}</span>
          </div>
          {nodeData.config?.fileId && (
            <div className="flex items-center justify-between">
              <span>Name:</span>
              <span className="font-medium truncate max-w-[120px]" title={selectedFileName}>
                {selectedFileName}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span>Headers:</span>
            <span className="font-medium">{nodeData.config?.hasHeaders ? 'Yes' : 'No'}</span>
          </div>
        </div>
        
        <div className="mt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full text-xs"
            onClick={() => setIsDialogOpen(true)}
          >
            Select File
          </Button>
        </div>
      </div>
      
      {/* File selection dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select a File</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search files..."
                className="pl-9 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* File list */}
            <div className="max-h-60 overflow-y-auto space-y-2">
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-3 border rounded-md">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-5 w-5" />
                        <div className="flex flex-col flex-1 space-y-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-12" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredFiles.length > 0 ? (
                filteredFiles.map(file => (
                  <div 
                    key={file.id} 
                    className={`p-3 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors ${nodeData.config?.fileId === file.id ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200'}`}
                    onClick={() => handleFileSelect(file.id, file.filename)}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-blue-500 flex-shrink-0" />
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {file.filename}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatFileSize(file.file_size)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : searchQuery ? (
                <div className="text-sm text-gray-500 text-center py-4">
                  No files match your search
                </div>
              ) : (
                <div className="text-sm text-gray-500 text-center py-4">
                  No files available
                </div>
              )}
            </div>
            
            {/* Upload new file button */}
            <div className="pt-2">
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => setUploadDialogOpen(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload New File
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* File upload dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload New File</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {!selectedFile ? (
              <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition-colors" onClick={() => document.getElementById('file-upload')?.click()}>
                <Upload className="h-6 w-6 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">Click to browse or drag and drop</p>
                <p className="text-xs text-gray-500 mt-1">Supports Excel and CSV files</p>
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 border rounded-md">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-blue-500 flex-shrink-0" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {selectedFile.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatFileSize(selectedFile.size)}
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-gray-500"
                      onClick={() => setSelectedFile(null)}
                      disabled={isUploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {isUploading && (
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                )}
                
                <Button 
                  className="w-full" 
                  onClick={handleUpload} 
                  disabled={isUploading}
                >
                  {isUploading ? "Uploading..." : "Upload File"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Output handle - bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        style={{
          background: '#3b82f6',
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
};

export default memo(FileUploadNode);
