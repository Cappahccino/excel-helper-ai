
import React, { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileUp, GripVertical, FileText, Search } from 'lucide-react';
import { NodeProps, FileUploadNodeData } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const handleFileSelect = (fileId: string, fileName: string) => {
    if (nodeData && nodeData.config) {
      nodeData.config.fileId = fileId;
      nodeData.config.fileName = fileName;
    }
    setIsDialogOpen(false);
  };

  // Get selected file name
  const selectedFileName = nodeData.config?.fileName || 'Not selected';
  
  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleUploadNewFile = () => {
    toast.info("File upload functionality would be triggered here");
    // This would typically open a file upload dialog or redirect to the file upload page
    // For simplicity, we're just showing a toast notification
  };

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
      
      {/* Dialog for file selection */}
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
                <div className="flex justify-center p-4">
                  <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : error ? (
                <div className="text-sm text-red-500 text-center py-4">
                  {error}
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
                onClick={handleUploadNewFile}
              >
                Upload New File
              </Button>
            </div>
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
