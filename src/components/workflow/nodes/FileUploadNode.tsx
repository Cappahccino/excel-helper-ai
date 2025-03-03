
import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileUp, FileText, Search, X, File, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NodeProps, FileUploadNodeData } from '@/types/workflow';
import { supabase } from '@/integrations/supabase/client';
import { validateFile } from '@/utils/fileUtils';
import { useToast } from '@/hooks/use-toast';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExcelFile } from '@/types/files';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

const FileUploadNode: React.FC<NodeProps<FileUploadNodeData>> = ({ data, id }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<ExcelFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<ExcelFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ExcelFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [fileProcessingError, setFileProcessingError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const label = data?.label || 'File Upload';
  
  // Fetch files on component mount
  useEffect(() => {
    fetchRecentFiles();
  }, []);
  
  // Poll for file processing status if a file is selected
  useEffect(() => {
    let intervalId: number | null = null;
    
    const checkProcessingStatus = async () => {
      if (!selectedFile?.id || !data?.workflowId) return;
      
      try {
        const { data: workflowFile, error } = await supabase
          .from('workflow_files')
          .select('*')
          .eq('file_id', selectedFile.id)
          .eq('workflow_id', data.workflowId)
          .maybeSingle();
          
        if (error) {
          console.error('Error fetching workflow file status:', error);
          return;
        }
        
        if (workflowFile) {
          setProcessingStatus(workflowFile.processing_status || workflowFile.status);
          
          // Set progress based on status
          if (workflowFile.status === 'completed') {
            setProcessingProgress(100);
            setFileProcessingError(null);
            // Clear interval once complete
            if (intervalId) window.clearInterval(intervalId);
          } else if (workflowFile.status === 'failed') {
            setProcessingProgress(100);
            setFileProcessingError(workflowFile.processing_error || 'Processing failed');
            // Clear interval on failure
            if (intervalId) window.clearInterval(intervalId);
          } else if (workflowFile.status === 'processing') {
            // Simulate progress for processing state
            setProcessingProgress(prev => Math.min(prev + 5, 90));
          } else if (workflowFile.status === 'queued') {
            setProcessingProgress(10);
          }
        }
      } catch (error) {
        console.error('Error checking processing status:', error);
      }
    };
    
    // Start polling if file is selected
    if (selectedFile?.id && data?.workflowId) {
      // Check immediately
      checkProcessingStatus();
      
      // Then start polling every 3 seconds
      intervalId = window.setInterval(checkProcessingStatus, 3000);
    }
    
    // Cleanup
    return () => {
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [selectedFile?.id, data?.workflowId]);
  
  // Filter files when search term changes
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredFiles(files);
    } else {
      const filtered = files.filter(file => 
        file.filename.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredFiles(filtered);
    }
  }, [searchTerm, files]);

  const fetchRecentFiles = async () => {
    try {
      setIsLoading(true);
      const { data: fileData, error } = await supabase
        .from('excel_files')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setFiles(fileData || []);
      setFilteredFiles(fileData || []);
    } catch (error) {
      console.error('Error fetching files:', error);
      toast({
        title: "Error fetching files",
        description: "Could not load your recent files",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleBrowseClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };
  
  const handleFileDrop = async (file: File) => {
    await uploadFile(file);
  };
  
  const uploadFile = async (file: File) => {
    try {
      setIsUploading(true);
      
      // Validate file
      const validation = validateFile(file);
      if (!validation.isValid) {
        toast({
          title: "Invalid File",
          description: validation.error || "Please upload a valid file",
          variant: "destructive",
        });
        return;
      }
      
      // Get user ID
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        toast({
          title: "Authentication Error",
          description: "Please login to upload files",
          variant: "destructive",
        });
        return;
      }
      
      // Generate unique file path
      const filePath = `${crypto.randomUUID()}-${file.name}`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, file);
        
      if (uploadError) throw uploadError;
      
      // Add to database
      const { data: fileRecord, error: dbError } = await supabase
        .from('excel_files')
        .insert({
          filename: file.name,
          file_path: filePath,
          file_size: file.size,
          user_id: userData.user.id,
          processing_status: "pending",
          mime_type: file.type,
          storage_verified: true
        })
        .select()
        .single();
        
      if (dbError) throw dbError;
      
      toast({
        title: "Upload Successful",
        description: "File has been uploaded successfully",
      });
      
      // Update files list and select the new file
      await fetchRecentFiles();
      setSelectedFile(fileRecord);
      
      // Reset processing status for new file
      setProcessingStatus('pending');
      setProcessingProgress(0);
      setFileProcessingError(null);
      
      // Update node data with the selected file
      if (data) {
        if (!data.config) {
          data.config = {};
        }
        data.config.fileId = fileRecord.id;
        data.config.filename = fileRecord.filename;
        
        // Queue file for processing
        if (data.workflowId) {
          await queueFileForProcessing(fileRecord.id, data.workflowId, id);
        }
      }
      
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: "Could not upload the file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const queueFileForProcessing = async (fileId: string, workflowId: string, nodeId: string) => {
    try {
      setProcessingStatus('queuing');
      setProcessingProgress(5);
      
      // Check if workflow file record already exists
      const { data: existingRecord, error: checkError } = await supabase
        .from('workflow_files')
        .select('*')
        .eq('file_id', fileId)
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
      
      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }
      
      // Create or update workflow file record
      if (existingRecord) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('workflow_files')
          .update({
            status: 'queued',
            processing_status: 'queued',
            processing_error: null,
            processing_result: null
          })
          .eq('id', existingRecord.id);
          
        if (updateError) throw updateError;
      } else {
        // Create new record
        const { error: insertError } = await supabase
          .from('workflow_files')
          .insert({
            workflow_id: workflowId,
            file_id: fileId,
            node_id: nodeId,
            status: 'queued',
            processing_status: 'queued'
          });
          
        if (insertError) throw insertError;
      }
      
      // Call processFile edge function
      const { error: fnError } = await supabase.functions.invoke('processFile', {
        body: {
          fileId,
          workflowId,
          nodeId
        }
      });
      
      if (fnError) throw fnError;
      
      setProcessingStatus('queued');
      setProcessingProgress(10);
      
    } catch (error) {
      console.error('Error queueing file for processing:', error);
      setProcessingStatus('error');
      setFileProcessingError('Failed to queue file for processing');
      toast({
        title: "Processing Error",
        description: "Failed to queue file for processing",
        variant: "destructive",
      });
    }
  };
  
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileDrop(file);
    }
  };
  
  const handleFileSelection = async (file: ExcelFile) => {
    setSelectedFile(file);
    setSearchTerm('');
    
    // Reset processing status
    setProcessingStatus(null);
    setProcessingProgress(0);
    setFileProcessingError(null);
    
    // Update node data with the selected file
    if (data) {
      if (!data.config) {
        data.config = {};
      }
      data.config.fileId = file.id;
      data.config.filename = file.filename;
      
      // Queue file for processing if in a workflow
      if (data.workflowId) {
        await queueFileForProcessing(file.id, data.workflowId, id);
      }
    }
  };
  
  const clearSelectedFile = () => {
    setSelectedFile(null);
    setProcessingStatus(null);
    setProcessingProgress(0);
    setFileProcessingError(null);
    
    // Clear file from node data
    if (data && data.config) {
      data.config.fileId = undefined;
      data.config.filename = undefined;
    }
  };
  
  // Helper function to render status badge
  const renderStatusBadge = () => {
    if (!processingStatus) return null;
    
    let variant = 'default';
    let icon = null;
    let label = processingStatus;
    
    switch (processingStatus) {
      case 'completed':
        variant = 'success';
        icon = <CheckCircle2 className="h-3 w-3 mr-1" />;
        label = 'Processed';
        break;
      case 'failed':
      case 'error':
        variant = 'destructive';
        icon = <AlertCircle className="h-3 w-3 mr-1" />;
        label = 'Failed';
        break;
      case 'processing':
      case 'analyzing':
      case 'queued':
      case 'queued_for_processing':
      case 'downloading':
        variant = 'secondary';
        icon = <Loader2 className="h-3 w-3 mr-1 animate-spin" />;
        label = 'Processing';
        break;
      default:
        variant = 'outline';
        label = processingStatus;
    }
    
    return (
      <Badge variant={variant as any} className="flex items-center text-xs">
        {icon}
        {label}
      </Badge>
    );
  };
  
  return (
    <Card className="w-[300px] shadow-md">
      <CardHeader className="bg-blue-50 py-2 flex flex-row items-center">
        <FileUp className="h-4 w-4 mr-2 text-blue-500" />
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          {/* Search and File Dropdown */}
          <div className="relative">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search files..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 text-sm"
                  />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[280px] max-h-[200px] overflow-y-auto">
                {isLoading ? (
                  <div className="flex justify-center p-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : filteredFiles.length > 0 ? (
                  filteredFiles.map(file => (
                    <DropdownMenuItem 
                      key={file.id}
                      onClick={() => handleFileSelection(file)}
                      className="flex items-center py-2"
                    >
                      <File className="h-4 w-4 mr-2 text-blue-500" />
                      <span className="text-sm truncate">{file.filename}</span>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <div className="p-2 text-sm text-center text-muted-foreground">
                    No files found
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Selected File Display */}
          {selectedFile ? (
            <div className="border rounded p-2 bg-blue-50 relative">
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-1 right-1 h-6 w-6"
                onClick={clearSelectedFile}
              >
                <X className="h-3 w-3" />
              </Button>
              <div className="flex flex-col">
                <div className="flex items-center">
                  <FileText className="h-5 w-5 text-blue-500 mr-2" />
                  <span className="text-xs font-medium truncate">
                    {selectedFile.filename}
                  </span>
                </div>
                
                {/* Processing Status and Progress */}
                {processingStatus && (
                  <div className="mt-2 flex flex-col space-y-1">
                    <div className="flex justify-between items-center">
                      {renderStatusBadge()}
                      <span className="text-xs text-gray-500">{processingProgress}%</span>
                    </div>
                    <Progress value={processingProgress} className="h-1 w-full" />
                    {fileProcessingError && (
                      <p className="text-xs text-red-500 mt-1">{fileProcessingError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* File Drop Zone */
            <div 
              className={`border rounded p-2 min-h-[80px] flex flex-col items-center justify-center ${
                isDragging ? 'bg-blue-100 border-blue-300' : 'bg-gray-50'
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {isUploading ? (
                <div className="flex flex-col items-center justify-center">
                  <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-2" />
                  <p className="text-xs text-center text-muted-foreground">
                    Uploading...
                  </p>
                </div>
              ) : (
                <>
                  <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-xs text-center text-muted-foreground">
                    Drag & drop files here
                  </p>
                </>
              )}
            </div>
          )}
          
          {/* Browse Files Button */}
          <div className="flex justify-center">
            <Button 
              size="sm" 
              className="w-full text-xs"
              onClick={handleBrowseClick}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <FileUp className="h-3 w-3 mr-1" />
              )}
              Browse Files
            </Button>
            <input 
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
          </div>
          
          <div className="text-xs text-muted-foreground">
            <Label className="mb-1 block">Supported formats:</Label>
            <p>CSV and excel supported files only</p>
          </div>
        </div>
      </CardContent>
      
      {/* Input handle at the top */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="w-2 h-2 !bg-blue-500"
      />
      
      {/* Output handle at the bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="w-2 h-2 !bg-blue-500"
      />
    </Card>
  );
};

export default FileUploadNode;
