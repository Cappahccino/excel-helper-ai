import React, { useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileUploadNodeData, NodeProps } from '@/types/workflow';
import { Upload, FileCheck, AlertCircle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useWorkflow } from '../context/WorkflowContext';

const FileUploadNode: React.FC<NodeProps<FileUploadNodeData>> = ({ 
  id, 
  data,
  selected 
}) => {
  const { toast } = useToast();
  const workflow = useWorkflow();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    
    const file = acceptedFiles[0];
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        toast({
          title: 'Authentication Error',
          description: 'Could not retrieve user ID. Please ensure you are logged in.',
          variant: 'destructive',
        });
        return;
      }
      
      const fileId = `file-${userId}-${Date.now()}-${file.name}`;
      
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('workflow-files')
        .upload(`${userId}/${fileId}`, file, {
          cacheControl: '3600',
          upsert: false,
          onUploadProgress: (progress) => {
            const percentComplete = Math.round((progress.loaded / progress.total) * 100);
            setUploadProgress(percentComplete);
          }
        });
      
      if (uploadError) {
        console.error('File upload error:', uploadError);
        toast({
          title: 'Upload Error',
          description: `Failed to upload file: ${uploadError.message}`,
          variant: 'destructive',
        });
        setError('Failed to upload file. Please try again.');
        return;
      }
      
      console.log('File uploaded successfully:', uploadData);
      toast({
        title: 'File Uploaded',
        description: `${file.name} uploaded successfully!`,
      });
      
      // After the file is uploaded successfully, update the node config
      const updatedConfig = {
        ...data.config,
        fileId: fileId,
        fileName: file.name,
        uploadStatus: 'completed'
      };
      
      // Use the onConfigChange handler if it exists, otherwise handle locally
      if (data.onConfigChange) {
        data.onConfigChange(updatedConfig);
      } else {
        console.log('No onConfigChange handler provided for node:', id);
      }
      
      // If we have a workflow context and IDs, propagate the schema
      if (workflow.workflowId) {
        try {
          const workflowId = workflow.workflowId;
          await workflow.propagateFileSchema(id, '');
        } catch (error) {
          console.error('Failed to propagate schema:', error);
        }
      }

    } catch (error) {
      console.error('File upload error:', error);
      setError('Failed to upload file. Please try again.');
      
      if (data.onConfigChange) {
        data.onConfigChange({
          ...data.config,
          uploadStatus: 'error'
        });
      }
    } finally {
      setIsUploading(false);
    }
  }, [id, data, workflow, toast]);

  const {getRootProps, getInputProps, open: openFileSelector, isDragActive} = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    }
  });

  return (
    <div className={`workflow-node ${selected ? 'selected' : ''}`}>
      <Handle type="source" position={Position.Right} id="output" />
      
      <Card className="w-64 shadow-md node-card">
        <CardContent className="p-4">
          <div className="text-sm font-medium mb-2 flex items-center justify-between">
            <span>{data.label || 'File Upload'}</span>
            <Upload className="h-4 w-4 text-gray-500" />
          </div>
          
          {data.config.fileId ? (
            <div className="border border-green-200 bg-green-50 p-2 rounded text-sm">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <FileCheck className="h-4 w-4" />
                <span className="font-medium">File Uploaded</span>
              </div>
              <div className="text-xs text-gray-600 truncate" title={data.config.fileName}>
                {data.config.fileName}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2 w-full text-xs" 
                onClick={openFileSelector}
              >
                Replace File
              </Button>
            </div>
          ) : (
            <div 
              {...getRootProps()} 
              className="border-2 border-dashed border-gray-300 p-4 rounded-md bg-gray-50 hover:bg-gray-100 cursor-pointer text-center"
            >
              <input {...getInputProps()} />
              <p className="text-sm text-gray-500">
                Drag & drop a file here, or click to select
              </p>
            </div>
          )}
          
          {isUploading && (
            <div className="mt-2">
              <div className="h-1 w-full bg-gray-200 rounded overflow-hidden">
                <div 
                  className="h-full bg-blue-500" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                Uploading... {uploadProgress}%
              </p>
            </div>
          )}
          
          {error && (
            <div className="mt-2 p-2 bg-red-50 text-red-600 text-xs rounded flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FileUploadNode;
