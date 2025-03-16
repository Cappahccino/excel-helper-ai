
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/hooks/use-toast';
import { validateFile, sanitizeFileName } from '@/utils/fileUtils';
import { FileProcessingState } from '@/types/fileProcessing';
import { useFileProcessingState } from './useFileProcessingState';

export interface DirectFileUploadOptions {
  workflowId: string | null;
  nodeId: string;
  onFileUploaded?: (fileId: string, filename: string) => void;
}

export function useDirectFileUpload({ workflowId, nodeId, onFileUploaded }: DirectFileUploadOptions) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  
  const {
    processingState,
    updateProcessingState,
    isProcessing,
    isComplete,
    isError,
    isPending
  } = useFileProcessingState({
    status: 'pending',
    progress: 0
  });

  // Reset file input
  const resetInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setSelectedFile(null);
    updateProcessingState('pending', 0);
  }, [updateProcessingState]);

  // Handle file drop
  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);

      if (isProcessing || uploadingRef.current) return;

      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;
      
      // Take only first file
      const file = files[0];
      
      // Validate file
      const validation = validateFile(file);
      if (!validation.isValid) {
        toast({
          title: 'Invalid file',
          description: validation.error,
          variant: 'destructive',
        });
        return;
      }
      
      setSelectedFile(file);
      uploadFile(file);
    },
    [isProcessing, toast]
  );

  // Handle file change via input
  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (isProcessing || uploadingRef.current) return;

      const files = event.target.files;
      if (!files || files.length === 0) return;
      
      const file = files[0];
      
      // Validate file
      const validation = validateFile(file);
      if (!validation.isValid) {
        toast({
          title: 'Invalid file',
          description: validation.error,
          variant: 'destructive',
        });
        resetInput();
        return;
      }
      
      setSelectedFile(file);
      uploadFile(file);
    },
    [isProcessing, resetInput, toast]
  );

  // Trigger input click
  const handleSelectClick = useCallback(() => {
    if (isProcessing || uploadingRef.current) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [isProcessing]);

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  // Main upload function
  const uploadFile = useCallback(
    async (file: File) => {
      if (!workflowId || !nodeId || uploadingRef.current) return;
      
      try {
        uploadingRef.current = true;
        updateProcessingState('uploading', 0, 'Preparing file...');
        
        // Check current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User not authenticated');
        }
        
        // Sanitize filename
        const sanitizedFilename = sanitizeFileName(file.name);
        const newFile = new File([file], sanitizedFilename, { type: file.type });
        
        // Update progress
        updateProcessingState('uploading', 10, 'Uploading file...');
        
        // Generate unique file path
        const filePath = `${uuidv4()}-${sanitizedFilename}`;
        
        // Upload file to storage
        const { error: uploadError } = await supabase.storage
          .from('excel_files')
          .upload(filePath, newFile, {
            cacheControl: '3600',
            upsert: false,
          });
          
        if (uploadError) throw uploadError;
        
        // Update progress
        updateProcessingState('uploading', 40, 'Creating file record...');
        
        // Create file record in database
        const { data: fileRecord, error: dbError } = await supabase
          .from('excel_files')
          .insert({
            filename: sanitizedFilename,
            file_path: filePath,
            file_size: newFile.size,
            user_id: user.id,
            processing_status: 'pending',
            mime_type: newFile.type,
            storage_verified: true,
          })
          .select()
          .single();
          
        if (dbError || !fileRecord) throw dbError || new Error('Failed to create file record');
        
        // Update progress
        updateProcessingState('associating', 60, 'Associating file with workflow...');
        
        // Associate file with workflow node
        const fileId = fileRecord.id;
        
        // Call our RPC function to associate the file with the workflow node
        const { data: associateData, error: associateError } = await supabase.rpc(
          'associate_file_with_workflow_node',
          {
            p_file_id: fileId,
            p_workflow_id: workflowId,
            p_node_id: nodeId
          }
        );
        
        if (associateError || !associateData) {
          throw associateError || new Error('Failed to associate file with workflow node');
        }
        
        // Update progress
        updateProcessingState('processing', 80, 'Processing file...');
        
        // Process the file
        const processResponse = await supabase.functions.invoke('processFile', {
          body: {
            fileId,
            workflowId,
            nodeId
          }
        });
        
        if (processResponse.error) {
          throw new Error(`Processing error: ${processResponse.error.message}`);
        }
        
        if (!processResponse.data.success) {
          throw new Error(processResponse.data.error || 'Unknown processing error');
        }
        
        // Complete
        updateProcessingState('completed', 100, 'File ready');
        
        // Notify parent component about the upload
        if (onFileUploaded) {
          onFileUploaded(fileId, sanitizedFilename);
        }
        
        toast({
          title: 'Upload successful',
          description: `${sanitizedFilename} has been uploaded and processed.`,
        });
      } catch (error) {
        console.error('Upload error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        updateProcessingState('error', 0, 'Upload failed', errorMessage);
        
        toast({
          title: 'Upload failed',
          description: errorMessage,
          variant: 'destructive',
        });
      } finally {
        uploadingRef.current = false;
      }
    },
    [workflowId, nodeId, updateProcessingState, toast, onFileUploaded]
  );
  
  // Handle retry
  const handleRetry = useCallback(() => {
    if (selectedFile) {
      uploadFile(selectedFile);
    } else {
      updateProcessingState('pending', 0);
    }
  }, [selectedFile, uploadFile, updateProcessingState]);
  
  return {
    selectedFile,
    processingState,
    isDragActive,
    fileInputRef,
    isPending,
    isProcessing,
    isComplete,
    isError,
    handleDrop,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleFileChange,
    handleSelectClick,
    handleRetry,
    resetInput
  };
}
