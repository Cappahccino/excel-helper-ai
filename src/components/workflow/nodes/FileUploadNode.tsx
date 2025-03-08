
import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileUp, FileText, Search, X, File, AlertCircle, CheckCircle2, Loader2, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { FileUploadNodeData, FileProcessingState, FileProcessingStateLabels } from '@/types/workflow';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { useWorkflow } from '../context/WorkflowContext';

// Helper component to show processing state
const ProcessingIndicator: React.FC<{
  state: FileProcessingState;
  progress?: number;
}> = ({ state, progress = 0 }) => {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center">
          {state === 'idle' && <File className="h-4 w-4 mr-2 text-gray-400" />}
          {state === 'pending' && <Loader2 className="h-4 w-4 mr-2 text-blue-500 animate-spin" />}
          {state === 'queuing' && <Loader2 className="h-4 w-4 mr-2 text-blue-500 animate-spin" />}
          {state === 'queued' && <Loader2 className="h-4 w-4 mr-2 text-blue-500 animate-spin" />}
          {state === 'processing' && <Loader2 className="h-4 w-4 mr-2 text-blue-500 animate-spin" />}
          {state === 'completed' && <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />}
          {state === 'failed' && <AlertCircle className="h-4 w-4 mr-2 text-red-500" />}
          {state === 'error' && <AlertCircle className="h-4 w-4 mr-2 text-red-500" />}
          <span className="text-xs font-medium">{FileProcessingStateLabels[state]}</span>
        </div>
        {(state === 'processing' || state === 'queuing' || state === 'queued') && (
          <span className="text-xs text-gray-500">{progress}%</span>
        )}
      </div>
      {(state === 'processing' || state === 'queuing' || state === 'queued') && (
        <Progress value={progress} className="h-1" />
      )}
    </div>
  );
};

// Helper component to show file details
const FileDetails: React.FC<{
  filename: string;
  fileSize?: number;
  onRemove: () => void;
  processingState: FileProcessingState;
  processingProgress?: number;
  isPreview?: boolean;
}> = ({ filename, fileSize, onRemove, processingState, processingProgress = 0, isPreview = false }) => {
  return (
    <div className="mt-2 p-2 bg-gray-50 rounded-md border">
      <div className="flex items-center justify-between">
        <div className="flex items-center overflow-hidden">
          <FileText className="h-4 w-4 mr-2 flex-shrink-0 text-blue-500" />
          <span className="text-sm font-medium truncate">{filename}</span>
        </div>
        {processingState !== 'processing' && processingState !== 'queued' && processingState !== 'queuing' && !isPreview && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6" 
            onClick={onRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {fileSize && (
        <div className="text-xs text-gray-500 mt-1">
          {(fileSize / 1024 / 1024).toFixed(2)} MB
        </div>
      )}
      <ProcessingIndicator state={processingState} progress={processingProgress} />
    </div>
  );
};

// Main FileUploadNode component
const FileUploadNode: React.FC<{
  id: string;
  selected: boolean;
  data: FileUploadNodeData;
}> = ({ id, selected, data }) => {
  const { workflowId, convertToDbWorkflowId } = useWorkflow();
  
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(data.config?.fileId || null);
  const [filename, setFilename] = useState<string>(data.config?.filename || '');
  const [hasHeaders, setHasHeaders] = useState<boolean>(data.config?.hasHeaders !== false);
  const [delimiter, setDelimiter] = useState<string>(data.config?.delimiter || ',');
  const [processingState, setProcessingState] = useState<FileProcessingState>('idle');
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Set up file drop zone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/json': ['.json'],
    },
    maxFiles: 1,
    disabled: isUploading || processingState === 'processing' || processingState === 'queued' || processingState === 'queuing',
  });

  // Handle file drop
  function handleFileDrop(acceptedFiles: File[]) {
    if (acceptedFiles.length > 0) {
      const droppedFile = acceptedFiles[0];
      setPreviewFile(droppedFile);
      setPreviewMode(true);
    }
  }

  // Handle file selection confirmation
  const confirmFileSelection = async () => {
    if (!previewFile) return;
    
    setFile(previewFile);
    setFilename(previewFile.name);
    setPreviewMode(false);
    
    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      // Upload the file to storage
      const fileExt = previewFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      
      // Fix for the onUploadProgress issue - use progress event handler
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('workflow-files')
        .upload(fileName, previewFile, {
          cacheControl: '3600',
          upsert: false,
          // Use progress event as an option
          onUploadProgress: (progress: { loaded: number; total: number }) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            setUploadProgress(percent);
          } as any, // Type assertion to bypass the type check
        });
      
      if (uploadError) {
        throw uploadError;
      }
      
      // Create a record in the files table
      const newFileId = crypto.randomUUID();
      
      // Fix for the "files" table issue - use correct table name "excel_files"
      const { error: fileError } = await supabase
        .from('excel_files')
        .insert({
          id: newFileId,
          filename: previewFile.name,
          file_size: previewFile.size,
          mime_type: previewFile.type,
          file_path: uploadData.path,
          user_id: (await supabase.auth.getUser()).data.user?.id,
        });
      
      if (fileError) {
        throw fileError;
      }
      
      // Update the node data
      setFileId(newFileId);
      
      // Update the node config
      if (data.onChange) {
        data.onChange(id, {
          fileId: newFileId,
          filename: previewFile.name,
          hasHeaders,
          delimiter,
        });
      }
      
      // Queue the file for processing
      if (workflowId) {
        await queueFileForProcessing(newFileId, workflowId, id);
      } else {
        console.warn('No workflow ID available, file will not be processed yet');
      }
      
      toast.success('File uploaded successfully');
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload file');
      setProcessingState('error');
    } finally {
      setIsUploading(false);
      setPreviewFile(null);
    }
  };

  // Cancel file selection
  const cancelFileSelection = () => {
    setPreviewFile(null);
    setPreviewMode(false);
  };

  // Remove the current file
  const removeFile = async () => {
    if (!fileId) return;
    
    try {
      // Update the node data
      setFile(null);
      setFileId(null);
      setFilename('');
      setProcessingState('idle');
      setProcessingProgress(0);
      
      // Update the node config
      if (data.onChange) {
        data.onChange(id, {
          fileId: null,
          filename: '',
        });
      }
      
      // We don't actually delete the file from storage, just remove the association
      toast.success('File removed from node');
    } catch (error) {
      console.error('Error removing file:', error);
      toast.error('Failed to remove file');
    }
  };

  // Queue file for processing in the workflow
  const queueFileForProcessing = async (fileId: string, workflowId: string, nodeId: string) => {
    try {
      setProcessingState('queuing');
      setProcessingProgress(5);
      
      console.log(`Queueing file ${fileId} for workflow ${workflowId} (${typeof workflowId}), node ${nodeId}`);
      console.log(`Is temporary workflow ID: ${workflowId?.startsWith('temp-')}`);
      
      // Convert temporary ID to UUID for database operations if needed
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      console.log(`Using database workflow ID: ${dbWorkflowId}`);
      
      const { data: existingRecord, error: checkError } = await supabase
        .from('workflow_files')
        .select('*')
        .eq('workflow_id', dbWorkflowId)
        .eq('file_id', fileId)
        .eq('node_id', nodeId)
        .maybeSingle();
      
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing workflow file:', checkError);
        throw checkError;
      }
      
      if (existingRecord) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('workflow_files')
          .update({
            is_active: true,
            status: 'selected',
            processing_status: 'queued',
            updated_at: new Date().toISOString()
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
            workflow_id: dbWorkflowId, // Use the UUID for database
            file_id: fileId,
            node_id: nodeId,
            is_active: true,
            status: 'selected',
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
          workflowId: workflowId, // Send the original workflow ID, the function will handle temp IDs
          nodeId
        }
      });
      
      if (fnError) {
        console.error('Error invoking processFile function:', fnError);
        throw fnError;
      }
      
      setProcessingState('queued');
      setProcessingProgress(10);
      return true;
    } catch (error) {
      console.error('Error queueing file for processing:', error);
      setProcessingState('error');
      toast.error('Failed to queue file for processing');
      throw error;
    }
  };

  // Check file processing status
  const checkFileProcessingStatus = async () => {
    if (!fileId || !workflowId) return;
    
    try {
      // Convert temporary ID to UUID for database operations if needed
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const { data, error } = await supabase
        .from('workflow_files')
        .select('*')
        .eq('workflow_id', dbWorkflowId)
        .eq('file_id', fileId)
        .eq('node_id', id)
        .maybeSingle();
      
      if (error) {
        console.error('Error checking file processing status:', error);
        return;
      }
      
      if (data) {
        // Map the database status to our FileProcessingState
        const statusMap: Record<string, FileProcessingState> = {
          'selected': 'idle',
          'queued': 'queued',
          'processing': 'processing',
          'processed': 'completed',
          'failed': 'failed',
          'error': 'error'
        };
        
        const newState = statusMap[data.processing_status] || 'idle';
        setProcessingState(newState);
        
        // Set progress based on status
        if (newState === 'queued') {
          setProcessingProgress(10);
        } else if (newState === 'processing') {
          setProcessingProgress(50);
        } else if (newState === 'completed') {
          setProcessingProgress(100);
        }
      }
    } catch (error) {
      console.error('Error in checkFileProcessingStatus:', error);
    }
  };

  // Set up polling for file processing status
  useEffect(() => {
    if (fileId && workflowId && (processingState === 'queued' || processingState === 'processing')) {
      const interval = setInterval(checkFileProcessingStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [fileId, workflowId, processingState]);

  // Initial check for file processing status
  useEffect(() => {
    if (fileId && workflowId) {
      checkFileProcessingStatus();
    }
  }, [fileId, workflowId]);

  // Load file details if we have a fileId but no file
  useEffect(() => {
    const loadFileDetails = async () => {
      if (fileId && !file && !filename) {
        try {
          // Fix for the "files" table issue - use correct table name "excel_files"
          const { data, error } = await supabase
            .from('excel_files')
            .select('*')
            .eq('id', fileId)
            .maybeSingle();
          
          if (error) {
            console.error('Error loading file details:', error);
            return;
          }
          
          if (data) {
            // Fix for the name property issue - use filename property instead
            setFilename(data.filename || '');
          }
        } catch (error) {
          console.error('Error in loadFileDetails:', error);
        }
      }
    };
    
    loadFileDetails();
  }, [fileId, file, filename]);

  // Update node data when config changes
  useEffect(() => {
    if (data.onChange && (
      data.config?.fileId !== fileId ||
      data.config?.filename !== filename ||
      data.config?.hasHeaders !== hasHeaders ||
      data.config?.delimiter !== delimiter
    )) {
      data.onChange(id, {
        fileId,
        filename,
        hasHeaders,
        delimiter
      });
    }
  }, [fileId, filename, hasHeaders, delimiter]);

  return (
    <Card className={`w-[280px] ${selected ? 'border-blue-500 shadow-md' : ''}`}>
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-md flex items-center">
          <FileUp className="h-4 w-4 mr-2" />
          {data.label || 'File Upload'}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {/* File Upload Area */}
        {!fileId && !previewMode && (
          <div 
            {...getRootProps()} 
            className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'
            }`}
          >
            <input {...getInputProps()} ref={fileInputRef} />
            <FileUp className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">
              {isDragActive ? 'Drop the file here' : 'Drag & drop a file here, or click to select'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Supports CSV, Excel, and JSON files
            </p>
          </div>
        )}
        
        {/* File Preview Mode */}
        {previewMode && previewFile && (
          <div className="border rounded-md p-3">
            <h4 className="text-sm font-medium mb-2">Confirm file upload</h4>
            <FileDetails 
              filename={previewFile.name}
              fileSize={previewFile.size}
              onRemove={cancelFileSelection}
              processingState="idle"
              isPreview={true}
            />
            
            <div className="mt-3 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="hasHeaders" className="text-xs flex items-center">
                  <Checkbox 
                    id="hasHeaders" 
                    checked={hasHeaders} 
                    onCheckedChange={(checked) => setHasHeaders(checked === true)}
                    className="mr-2 h-3 w-3"
                  />
                  File has headers
                </Label>
              </div>
              
              {previewFile.name.endsWith('.csv') && (
                <div className="space-y-1">
                  <Label htmlFor="delimiter" className="text-xs">Delimiter</Label>
                  <Select 
                    value={delimiter} 
                    onValueChange={setDelimiter}
                  >
                    <SelectTrigger id="delimiter" className="h-8 text-xs">
                      <SelectValue placeholder="Select delimiter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=",">Comma (,)</SelectItem>
                      <SelectItem value=";">Semicolon (;)</SelectItem>
                      <SelectItem value="\t">Tab</SelectItem>
                      <SelectItem value="|">Pipe (|)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="flex space-x-2 pt-2">
                <Button 
                  size="sm" 
                  className="w-full text-xs h-8" 
                  onClick={confirmFileSelection}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Uploading {uploadProgress}%
                    </>
                  ) : (
                    'Upload File'
                  )}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full text-xs h-8" 
                  onClick={cancelFileSelection}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {/* Uploaded File */}
        {fileId && filename && (
          <div className="space-y-3">
            <FileDetails 
              filename={filename}
              onRemove={removeFile}
              processingState={processingState}
              processingProgress={processingProgress}
            />
            
            <div className="space-y-1">
              <Label htmlFor="hasHeaders" className="text-xs flex items-center">
                <Checkbox 
                  id="hasHeaders" 
                  checked={hasHeaders} 
                  onCheckedChange={(checked) => setHasHeaders(checked === true)}
                  className="mr-2 h-3 w-3"
                  disabled={processingState === 'processing' || processingState === 'queued' || processingState === 'queuing'}
                />
                File has headers
              </Label>
            </div>
            
            {filename.endsWith('.csv') && (
              <div className="space-y-1">
                <Label htmlFor="delimiter" className="text-xs">Delimiter</Label>
                <Select 
                  value={delimiter} 
                  onValueChange={setDelimiter}
                  disabled={processingState === 'processing' || processingState === 'queued' || processingState === 'queuing'}
                >
                  <SelectTrigger id="delimiter" className="h-8 text-xs">
                    <SelectValue placeholder="Select delimiter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=",">Comma (,)</SelectItem>
                    <SelectItem value=";">Semicolon (;)</SelectItem>
                    <SelectItem value="\t">Tab</SelectItem>
                    <SelectItem value="|">Pipe (|)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {processingState === 'completed' && (
              <div className="pt-1">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full text-xs h-8 flex items-center justify-center"
                  onClick={() => {
                    // View data preview functionality would go here
                    toast.info('Data preview not implemented yet');
                  }}
                >
                  <Search className="h-3 w-3 mr-1" />
                  Preview Data
                </Button>
              </div>
            )}
            
            {(processingState === 'error' || processingState === 'failed') && (
              <div className="pt-1">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full text-xs h-8 flex items-center justify-center"
                  onClick={async () => {
                    if (fileId && workflowId) {
                      try {
                        setProcessingState('queuing');
                        setProcessingProgress(0);
                        await queueFileForProcessing(fileId, workflowId, id);
                      } catch (error) {
                        console.error('Error retrying file processing:', error);
                      }
                    }
                  }}
                >
                  <Loader2 className="h-3 w-3 mr-1" />
                  Retry Processing
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
      
      {/* Input/Output Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: '#555' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: '#555' }}
      />
    </Card>
  );
};

export default FileUploadNode;
