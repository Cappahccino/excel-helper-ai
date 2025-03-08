import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileUp, FileText, Search, X, File, AlertCircle, CheckCircle2, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NodeProps, FileUploadNodeData, FileProcessingState, FileProcessingStateLabels } from '@/types/workflow';
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
import { useWorkflow } from '../context/WorkflowContext';
import { createFileSchema } from '@/utils/fileSchemaUtils';
import { useDebounce } from '@/hooks/useDebounce';

const FileUploadNode: React.FC<NodeProps<FileUploadNodeData>> = ({ data, id }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<ExcelFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<ExcelFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ExcelFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [processingState, setProcessingState] = useState<FileProcessingState>('idle');
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [fileProcessingError, setFileProcessingError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSchemaProcessed, setIsSchemaProcessed] = useState(false);
  const processingIntervalRef = useRef<number | null>(null);
  const debouncedSearch = useDebounce(debouncedSearchTerm, 300);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { saveFileSchema, propagateFileSchema, getFileSchema } = useWorkflow();
  const label = data?.label || 'File Upload';
  
  useEffect(() => {
    if (!isInitialized && data?.config?.fileId && data?.config?.filename && !selectedFile) {
      const fetchFileDetails = async () => {
        try {
          setIsLoading(true);
          const { data: fileData, error } = await supabase
            .from('excel_files')
            .select('*')
            .eq('id', data.config.fileId)
            .single();
            
          if (error) {
            console.error('Error fetching file details:', error);
            return;
          }
          
          if (fileData) {
            setSelectedFile(fileData);
            checkFileProcessingStatus(fileData.id, data.workflowId, id);
          }
        } catch (err) {
          console.error('Error fetching file details:', err);
        } finally {
          setIsLoading(false);
          setIsInitialized(true);
        }
      };
      
      fetchFileDetails();
    }
  }, [data?.config?.fileId, data?.config?.filename, data?.workflowId, id, isInitialized, selectedFile]);
  
  useEffect(() => {
    if (!isInitialized) {
      fetchRecentFiles();
    }
  }, [isInitialized]);
  
  useEffect(() => {
    if (debouncedSearch && debouncedSearch.length >= 2) {
      searchFiles(debouncedSearch);
    } else if (debouncedSearch === '') {
      fetchRecentFiles();
    }
  }, [debouncedSearch]);
  
  useEffect(() => {
    if (selectedFile?.id && data?.workflowId && !isSchemaProcessed) {
      const checkFileSchema = async () => {
        const schema = getFileSchema(id);
        
        if (!schema) {
          console.log('No schema found for node, creating one...');
          try {
            const fileSchema = await createFileSchema(
              data.workflowId,
              id,
              selectedFile.id,
              [],
              null,
              true
            );
            
            if (fileSchema) {
              console.log('File schema created:', fileSchema);
              if (typeof propagateFileSchema === 'function') {
                await propagateFileSchema(id, id);
              }
              setIsSchemaProcessed(true);
            }
          } catch (error) {
            console.error('Error creating file schema:', error);
          }
        } else {
          console.log('Schema already exists for this node:', schema);
          setIsSchemaProcessed(true);
        }
      };
      
      checkFileSchema();
    }
  }, [selectedFile?.id, data?.workflowId, id, getFileSchema, propagateFileSchema, isSchemaProcessed]);
  
  useEffect(() => {
    return () => {
      if (processingIntervalRef.current) {
        window.clearInterval(processingIntervalRef.current);
      }
    };
  }, []);
  
  const searchFiles = async (term: string) => {
    try {
      setIsLoading(true);
      const { data: fileData, error } = await supabase
        .from('excel_files')
        .select('*')
        .is('deleted_at', null)
        .ilike('filename', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setFilteredFiles(fileData || []);
    } catch (error) {
      console.error('Error searching files:', error);
      toast({
        title: "Search Error",
        description: "Could not search files",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const checkFileProcessingStatus = async (fileId: string, workflowId?: string, nodeId?: string) => {
    if (!fileId || !workflowId || !nodeId) return;
    
    try {
      const { data: workflowFile, error } = await supabase
        .from('workflow_files')
        .select('*')
        .eq('file_id', fileId)
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      if (error) {
        console.error('Error fetching workflow file status:', error);
        return;
      }
      
      if (workflowFile) {
        const status = workflowFile.status as string;
        setProcessingState(status as FileProcessingState);
        
        if (status === 'completed') {
          setProcessingProgress(100);
          setFileProcessingError(null);
          setIsSchemaProcessed(true);
          if (processingIntervalRef.current) {
            window.clearInterval(processingIntervalRef.current);
            processingIntervalRef.current = null;
          }
        } else if (status === 'failed') {
          setProcessingProgress(100);
          const metadata = workflowFile.metadata;
          const errorMessage = typeof metadata === 'object' && metadata !== null && 'error' in metadata
            ? String(metadata.error)
            : 'Processing failed';
          setFileProcessingError(errorMessage);
          if (processingIntervalRef.current) {
            window.clearInterval(processingIntervalRef.current);
            processingIntervalRef.current = null;
          }
        } else if (status === 'processing') {
          setProcessingProgress(prev => Math.min(prev + 5, 90));
        } else if (status === 'queued') {
          setProcessingProgress(10);
        }
      }
    } catch (error) {
      console.error('Error checking processing status:', error);
    }
  };
  
  const startFileProcessingPolling = (fileId: string, workflowId: string, nodeId: string) => {
    if (processingIntervalRef.current) {
      window.clearInterval(processingIntervalRef.current);
    }
    
    processingIntervalRef.current = window.setInterval(() => {
      checkFileProcessingStatus(fileId, workflowId, nodeId);
    }, 3000) as unknown as number;
  };

  const fetchRecentFiles = async function() {
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
  
  const handleFileSelect = async function(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };
  
  const handleFileDrop = async function(file: File) {
    await uploadFile(file);
  };
  
  const uploadFile = async function(file: File) {
    try {
      setIsUploading(true);
      setProcessingState('pending');
      setProcessingProgress(0);
      setFileProcessingError(null);
      
      const validation = validateFile(file);
      if (!validation.isValid) {
        toast({
          title: "Invalid File",
          description: validation.error || "Please upload a valid file",
          variant: "destructive",
        });
        setProcessingState('idle');
        return;
      }
      
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        toast({
          title: "Authentication Error",
          description: "Please login to upload files",
          variant: "destructive",
        });
        setProcessingState('idle');
        return;
      }
      
      const filePath = `${crypto.randomUUID()}-${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
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
      
      await fetchRecentFiles();
      setSelectedFile(fileRecord);
      setSearchTerm(''); // Clear search term after upload
      setIsDropdownOpen(false); // Close dropdown after selection
      
      setProcessingState('pending');
      setProcessingProgress(0);
      setFileProcessingError(null);
      setIsSchemaProcessed(false);
      
      if (data) {
        const updatedConfig = {
          ...(data.config || {}),
          fileId: fileRecord.id,
          filename: fileRecord.filename,
          hasHeaders: true, // Set a default value
        };
        
        if (typeof data.onChange === 'function') {
          data.onChange(id, { config: updatedConfig });
        }
        
        if (data.workflowId) {
          await queueFileForProcessing(fileRecord.id, data.workflowId, id);
          
          startFileProcessingPolling(fileRecord.id, data.workflowId, id);
        }
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: "Could not upload the file",
        variant: "destructive",
      });
      setProcessingState('error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const queueFileForProcessing = async function(fileId: string, workflowId: string, nodeId: string) {
    try {
      setProcessingState('queuing');
      setProcessingProgress(5);
      
      console.log(`Queueing file ${fileId} for workflow ${workflowId} (${typeof workflowId}), node ${nodeId}`);
      console.log(`Is temporary workflow ID: ${workflowId.startsWith('temp-')}`);
      
      const { data: existingRecord, error: checkError } = await supabase
        .from('workflow_files')
        .select('*')
        .eq('file_id', fileId)
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
      
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing workflow file:', checkError);
        throw checkError;
      }
      
      if (existingRecord) {
        const { error: updateError } = await supabase
          .from('workflow_files')
          .update({
            status: 'queued',
            processing_status: 'queued',
            processing_error: null,
            processing_result: null
          })
          .eq('id', existingRecord.id);
          
        if (updateError) {
          console.error('Error updating workflow file:', updateError);
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabase
          .from('workflow_files')
          .insert({
            workflow_id: workflowId,
            file_id: fileId,
            node_id: nodeId,
            status: 'queued',
            processing_status: 'queued'
          });
          
        if (insertError) {
          console.error('Error inserting workflow file:', insertError);
          console.error('Insert error details:', JSON.stringify(insertError));
          throw insertError;
        }
      }
      
      const { error: fnError } = await supabase.functions.invoke('processFile', {
        body: {
          fileId,
          workflowId,
          nodeId
        }
      });
      
      if (fnError) {
        console.error('Error invoking processFile function:', fnError);
        throw fnError;
      }
      
      setProcessingState('queued');
      setProcessingProgress(10);
      
    } catch (error) {
      console.error('Error queueing file for processing:', error);
      setProcessingState('error');
      setFileProcessingError('Failed to queue file for processing');
      toast({
        title: "Processing Error",
        description: "Failed to queue file for processing",
        variant: "destructive",
      });
    }
  };
  
  const handleDragEnter = function(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = function(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDragOver = function(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = function(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileDrop(file);
    }
  };
  
  const handleFileSelection = async function(file: ExcelFile) {
    if (selectedFile?.id === file.id) {
      setIsDropdownOpen(false);
      return;
    }
    
    setSelectedFile(file);
    setSearchTerm(''); // Clear search term after selection
    setDebouncedSearchTerm(''); // Also clear debounced search term
    setIsDropdownOpen(false); // Close dropdown after selection
    
    setProcessingState('idle');
    setProcessingProgress(0);
    setFileProcessingError(null);
    setIsSchemaProcessed(false);
    
    if (data) {
      const updatedConfig = {
        ...(data.config || {}),
        fileId: file.id,
        filename: file.filename,
        hasHeaders: true, // Set a default value
      };
      
      if (typeof data.onChange === 'function') {
        data.onChange(id, { config: updatedConfig });
      }
      
      if (data.workflowId) {
        console.log(`Selected file for workflow ${data.workflowId}, node ${id}`);
        await queueFileForProcessing(file.id, data.workflowId, id);
        
        startFileProcessingPolling(file.id, data.workflowId, id);
      }
    }
  };
  
  const clearSelectedFile = function() {
    if (processingIntervalRef.current) {
      window.clearInterval(processingIntervalRef.current);
      processingIntervalRef.current = null;
    }
    
    setSelectedFile(null);
    setProcessingState('idle');
    setProcessingProgress(0);
    setFileProcessingError(null);
    setIsSchemaProcessed(false);
    
    if (data) {
      const updatedConfig = { ...(data.config || {}) };
      delete updatedConfig.fileId;
      delete updatedConfig.filename;
      
      if (typeof data.onChange === 'function') {
        data.onChange(id, { config: updatedConfig });
      }
    }
  };
  
  const renderStatusBadge = () => {
    if (processingState === 'idle') return null;
    
    let variant = 'default';
    let icon = null;
    let label = FileProcessingStateLabels[processingState];
    
    switch (processingState) {
      case 'completed':
        variant = 'success';
        icon = <CheckCircle2 className="h-3 w-3 mr-1" />;
        break;
      case 'failed':
      case 'error':
        variant = 'destructive';
        icon = <AlertCircle className="h-3 w-3 mr-1" />;
        break;
      case 'processing':
      case 'queued':
      case 'queuing':
      case 'pending':
        variant = 'secondary';
        icon = <Loader2 className="h-3 w-3 mr-1 animate-spin" />;
        break;
      default:
        variant = 'outline';
    }
    
    return (
      <Badge variant={variant as any} className="flex items-center text-xs">
        {icon}
        {label}
      </Badge>
    );
  };
  
  const renderFileSearch = function() {
    return (
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            className="w-full justify-between" 
            onClick={() => setIsDropdownOpen(true)}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {selectedFile ? (
                <>
                  <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="truncate">{selectedFile.filename}</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Select a file...</span>
                </>
              )}
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[280px] p-0" align="start">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setDebouncedSearchTerm(e.target.value);
                }}
                className="pl-8 text-sm h-9"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : filteredFiles.length > 0 ? (
              filteredFiles.map(file => (
                <DropdownMenuItem 
                  key={file.id}
                  onClick={() => handleFileSelection(file)}
                  className="flex items-center gap-2 py-2 px-3 cursor-pointer"
                >
                  <File className="h-4 w-4 text-blue-500" />
                  <span className="text-sm truncate">{file.filename}</span>
                  {file.id === selectedFile?.id && (
                    <Check className="h-3.5 w-3.5 ml-auto text-green-500" />
                  )}
                </DropdownMenuItem>
              ))
            ) : (
              <div className="p-3 text-sm text-center text-muted-foreground">
                {searchTerm ? 'No files found' : 'No recent files'}
              </div>
            )}
          </div>
          <div className="border-t p-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs justify-center"
              onClick={handleBrowseClick}
            >
              <FileUp className="h-3.5 w-3.5 mr-1.5" />
              Upload New File
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
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
          <div className="relative">
            {renderFileSearch()}
          </div>
          
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
                
                {processingState !== 'idle' && (
                  <div className="mt-2 flex flex-col space-y-1">
                    <div className="flex justify-between items-center">
                      {renderStatusBadge()}
                      <span className="text-xs text-gray-500">{processingProgress}%</span>
                    </div>
                    <Progress value={processingProgress} className="h-1.5 w-full" />
                    {fileProcessingError && (
                      <p className="text-xs text-red-500 mt-1">{fileProcessingError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
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
      
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="w-2 h-2 !bg-blue-500"
      />
      
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
