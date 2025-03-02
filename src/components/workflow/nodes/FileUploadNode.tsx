
import React, { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileUp, GripVertical, Search, Plus } from 'lucide-react';
import { NodeProps, FileUploadNodeData } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileUploadZone } from '@/components/FileUploadZone';
import { Card, CardContent } from '@/components/ui/card';
import { ExcelFile } from '@/types/files';

// Default data if none is provided
const defaultData: FileUploadNodeData = {
  label: 'File Upload',
  type: 'fileUpload',
  config: {
    fileId: null,
    hasHeaders: true,
    delimiter: ','
  }
};

const FileUploadNode = ({ data, selected }: NodeProps<FileUploadNodeData>) => {
  const [files, setFiles] = useState<ExcelFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Use provided data or fallback to default data
  const nodeData = data ? {
    ...defaultData,
    ...data,
    config: {
      ...defaultData.config,
      ...(data.config || {})
    }
  } : defaultData;

  // Function to fetch files
  const fetchFiles = async () => {
    try {
      // Mock fetching files - in a real implementation, you would fetch from your API
      // This should be replaced with your actual file fetching logic
      console.log('Fetching files...');
      // Placeholder for actual file fetching
    } catch (error) {
      console.error('Error fetching files:', error);
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

  // Handle file upload completion
  const handleUploadComplete = (fileId: string) => {
    if (data && data.config) {
      data.config.fileId = fileId;
    }
    setIsUploading(false);
    setIsDialogOpen(false);
    fetchFiles(); // Refresh file list
  };

  // Get selected file name
  const selectedFileName = files.find(file => file.id === nodeData.config?.fileId)?.filename || 'No file selected';

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
                {filteredFiles.length > 0 ? (
                  filteredFiles.map(file => (
                    <Card 
                      key={file.id} 
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${nodeData.config?.fileId === file.id ? 'border-blue-500' : ''}`}
                      onClick={() => handleFileSelect(file.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="truncate max-w-[200px]">{file.filename}</div>
                          <div className="text-xs text-gray-500">
                            {(file.file_size / 1024).toFixed(1)} KB
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
                      onUploadComplete={handleUploadComplete}
                      onUploadError={() => setIsUploading(false)}
                    />
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => setIsUploading(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
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
