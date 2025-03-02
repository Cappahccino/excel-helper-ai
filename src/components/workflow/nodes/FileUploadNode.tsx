
import React, { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileUp, GripVertical, Search, Plus, Upload, FileSpreadsheet, X } from 'lucide-react';
import { NodeProps, FileUploadNodeData } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileUploadZone } from '@/components/FileUploadZone';
import { Card, CardContent } from '@/components/ui/card';
import { ExcelFile } from '@/types/files';
import { supabase } from '@/integrations/supabase/client';
import { Spinner } from '@/components/ui/spinner';

// Default data if none is provided
const FileUploadNode = ({ data, selected }: NodeProps<FileUploadNodeData>) => {
  const [files, setFiles] = useState<ExcelFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  

  // Function to fetch files from Supabase
  const fetchFiles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { data: fetchedFiles, error: fetchError } = await supabase
        .from('excel_files')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching files:', fetchError);
        setError('Failed to load files');
        return;
      }

      setFiles(fetchedFiles || []);
    } catch (error) {
      console.error('Error in fetchFiles:', error);
      setError('Failed to load files');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // Filter files based on search query
  const filteredFiles = files.filter(file => 
    file.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle file selection
  const handleFileSelect = (fileId: string) => {
    if (data && data.config) {
      data.config.fileId = fileId;
    }
    setIsDialogOpen(false);
  };

  // Handle file upload - matching the required function signature
  const handleFileUpload = async (files: File[]): Promise<void> => {
    try {
      setIsUploading(true);
      console.log('Uploading files:', files);
      // In a real implementation, this would connect to your file upload service
      // For now we resolve immediately to demonstrate the UI flow
      await new Promise(resolve => setTimeout(resolve, 1000));
      return Promise.resolve();
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  };

  // Handle file upload completion
  const handleUploadComplete = () => {
    if (data && data.config) {
      // Set the fileId if a file was uploaded successfully
      // This would normally come from your file upload response
      data.config.fileId = "new-file-id";
    }
    setIsUploading(false);
    setIsDialogOpen(false);
    fetchFiles(); // Refresh file list
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get selected file name
  const selectedFile = files.find(file => file.id === nodeData.config?.fileId);
  const selectedFileName = selectedFile?.filename || 'No file selected';

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
        <div className="text-xs text-gray-500 mb-2">
          <div className="flex items-center justify-between mb-1">
            <span>File:</span>
            <span className="font-medium truncate max-w-[120px]" title={selectedFileName}>
              {selectedFileName}
            </span>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full text-xs"
              onClick={() => {
                // Empty onClick handler to satisfy TypeScript
              }}
            >
              Select File
            </Button>
          </DialogTrigger>
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
                  <div className="flex justify-center p-4">
                    <Spinner className="h-6 w-6 text-blue-500" />
                  </div>
                ) : error ? (
                  <div className="text-sm text-red-500 text-center py-4">
                    {error}
                  </div>
                ) : filteredFiles.length > 0 ? (
                  filteredFiles.map(file => (
                    <Card 
                      key={file.id} 
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${nodeData.config?.fileId === file.id ? 'border-blue-500 bg-blue-50/50' : ''}`}
                      onClick={() => handleFileSelect(file.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <FileSpreadsheet className="h-5 w-5 text-green-600 flex-shrink-0" />
                          <div className="flex flex-col flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {file.filename}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatFileSize(file.file_size)}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
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
                {isUploading ? (
                  <div className="bg-gray-50 rounded-md p-4">
                    <FileUploadZone 
                      onFileUpload={handleFileUpload}
                      isUploading={true}
                      uploadProgress={{0: 50}}
                      currentFiles={null}
                      onReset={() => setIsUploading(false)}
                      onUploadComplete={handleUploadComplete}
                    />
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => setIsUploading(true)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload New File
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Input handle - top center */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        style={{
          background: '#94a3b8',
          width: 10,
          height: 10,
          top: -5,
        }}
      />
      
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
