
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  FileProcessingState, 
  FileProcessingProgress, 
  FileNodeState, 
  FileSchemaState,
  FileProcessingStates
} from '@/types/fileProcessing';
import { useFileProcessingState } from './useFileProcessingState';

interface UseFileUploadNodeStateProps {
  workflowId: string | null | undefined;
  nodeId: string | null | undefined;
}

export function useFileUploadNodeState({ workflowId, nodeId }: UseFileUploadNodeStateProps) {
  const {
    processingState,
    updateProcessingState,
    isProcessing,
    isComplete,
    isError,
    isPending
  } = useFileProcessingState();
  
  const [fileState, setFileState] = useState<FileNodeState>({
    nodeId: nodeId || '',
    processingState,
    lastUpdated: Date.now()
  });
  
  const [schema, setSchema] = useState<FileSchemaState | undefined>(undefined);
  const [metadata, setMetadata] = useState<Record<string, any> | undefined>(undefined);
  
  // Track subscription to file processing updates
  const [isSubscribed, setIsSubscribed] = useState(false);
  const subscriptionChannelRef = useRef<{ unsubscribe: () => void } | null>(null);
  
  // Update file state when processing state changes
  useEffect(() => {
    setFileState(prev => ({
      ...prev,
      processingState,
      lastUpdated: Date.now()
    }));
  }, [processingState]);
  
  // Fetch schema from database
  const fetchSchema = useCallback(async (fileId: string, sheetName?: string) => {
    if (!workflowId || !nodeId) return;
    
    try {
      updateProcessingState(FileProcessingStates.FETCHING_SCHEMA, 70, 'Fetching schema...');
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types, has_headers, sample_data, total_rows, sheet_name')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .eq('file_id', fileId)
        .maybeSingle();
        
      if (error) {
        console.error('Error fetching schema:', error);
        return;
      }
      
      if (data) {
        // Schema found
        const newSchema: FileSchemaState = {
          columns: data.columns,
          dataTypes: data.data_types || {},
          sampleData: data.sample_data,
          sheetName: data.sheet_name,
          totalRows: data.total_rows,
          hasHeaders: data.has_headers
        };
        
        setSchema(newSchema);
        
        setFileState(prev => ({
          ...prev,
          schema: newSchema,
          lastUpdated: Date.now()
        }));
      }
    } catch (err) {
      console.error('Error in fetchSchema:', err);
    }
  }, [workflowId, nodeId, updateProcessingState]);
  
  // Fetch initial file state
  useEffect(() => {
    if (!workflowId || !nodeId) return;
    
    const fetchFileState = async () => {
      try {
        const dbWorkflowId = convertToDbWorkflowId(workflowId);
        
        // Check for existing file association
        const { data: fileData, error: fileError } = await supabase
          .from('workflow_files')
          .select('file_id, metadata, processing_status')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', nodeId)
          .maybeSingle();
          
        if (fileError) {
          console.error('Error fetching file node state:', fileError);
          return;
        }
        
        if (fileData && fileData.file_id) {
          // Get file information
          const { data: fileInfo, error: infoError } = await supabase
            .from('excel_files')
            .select('filename, processing_status, error_message, processing_completed_at, processing_started_at')
            .eq('id', fileData.file_id)
            .maybeSingle();
            
          if (infoError) {
            console.error('Error fetching file info:', infoError);
            return;
          }
          
          if (fileInfo) {
            // Safely parse JSON metadata
            let metadataObj: Record<string, any> = {};
            if (fileData.metadata) {
              if (typeof fileData.metadata === 'string') {
                try {
                  metadataObj = JSON.parse(fileData.metadata);
                } catch (e) {
                  console.error('Error parsing metadata JSON:', e);
                }
              } else if (typeof fileData.metadata === 'object') {
                metadataObj = fileData.metadata;
              }
            }
            
            setFileState(prev => ({
              ...prev,
              fileId: fileData.file_id,
              fileName: fileInfo.filename,
              metadata: metadataObj,
              lastUpdated: Date.now()
            }));
            
            setMetadata(metadataObj);
            
            // Map database status to our status type
            const status = mapProcessingStatus(fileInfo.processing_status);
            
            // Calculate progress based on status
            let progress = calculateProgressFromStatus(status);
            
            updateProcessingState(
              status,
              progress,
              status === FileProcessingStates.ERROR ? 'Error processing file' : undefined,
              fileInfo.error_message
            );
            
            // If file is completed, fetch schema
            if (status === FileProcessingStates.COMPLETED) {
              const selectedSheet = metadataObj?.selected_sheet;
              await fetchSchema(fileData.file_id, selectedSheet);
            }
          }
        }
      } catch (error) {
        console.error('Error in fetchFileState:', error);
      }
    };
    
    fetchFileState();
  }, [workflowId, nodeId, fetchSchema, updateProcessingState]);
  
  // Set up subscriptions for file and processing updates
  useEffect(() => {
    if (!workflowId || !nodeId || isSubscribed) return;
    
    // Clean up any existing subscriptions
    if (subscriptionChannelRef.current) {
      subscriptionChannelRef.current.unsubscribe();
      subscriptionChannelRef.current = null;
    }
    
    const dbWorkflowId = convertToDbWorkflowId(workflowId);
    
    // Create a single channel for both workflow file and excel file updates
    const channel = supabase.channel(`file-updates-${nodeId}`);
    
    // Listen for workflow file updates
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'workflow_files',
        filter: `workflow_id=eq.${dbWorkflowId} AND node_id=eq.${nodeId}`
      },
      async (payload) => {
        console.log(`File association update for node ${nodeId}:`, payload);
        
        if (payload.new && payload.new.file_id) {
          // Safely parse JSON metadata
          let metadataObj: Record<string, any> = {};
          if (payload.new.metadata) {
            if (typeof payload.new.metadata === 'string') {
              try {
                metadataObj = JSON.parse(payload.new.metadata);
              } catch (e) {
                console.error('Error parsing metadata JSON:', e);
              }
            } else if (typeof payload.new.metadata === 'object') {
              metadataObj = payload.new.metadata;
            }
          }
          
          setFileState(prev => ({
            ...prev,
            fileId: payload.new.file_id,
            metadata: metadataObj,
            lastUpdated: Date.now()
          }));
          
          setMetadata(metadataObj);
          
          // If this is a new file_id, update the subscription for file processing
          if (fileState.fileId !== payload.new.file_id) {
            updateFileProcessingSubscription(channel, payload.new.file_id);
          }
          
          // If processing status is in the payload, update it
          if (payload.new.processing_status) {
            const status = mapProcessingStatus(payload.new.processing_status);
            updateProcessingState(
              status,
              calculateProgressFromStatus(status)
            );
          }
          
          // Get complete file info
          fetchFileInfoAndUpdate(payload.new.file_id);
        } else if (payload.eventType === 'DELETE') {
          // File association was removed
          setFileState(prev => ({
            ...prev,
            fileId: undefined,
            fileName: undefined,
            schema: undefined,
            metadata: undefined,
            lastUpdated: Date.now()
          }));
          
          setSchema(undefined);
          setMetadata(undefined);
          
          updateProcessingState(FileProcessingStates.PENDING, 0);
        }
      }
    );
    
    // If we already have a file ID, set up subscription for its processing updates
    if (fileState.fileId) {
      updateFileProcessingSubscription(channel, fileState.fileId);
    }
    
    // Subscribe to the channel
    subscriptionChannelRef.current = channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Subscribed to file updates for node ${nodeId}`);
        setIsSubscribed(true);
      } else {
        console.error(`Failed to subscribe to file updates: ${status}`);
      }
    });
    
    // Cleanup function
    return () => {
      if (subscriptionChannelRef.current) {
        subscriptionChannelRef.current.unsubscribe();
        subscriptionChannelRef.current = null;
      }
      setIsSubscribed(false);
    };
  }, [workflowId, nodeId, isSubscribed, fileState.fileId, updateProcessingState]);
  
  // Helper function to update file processing subscription
  const updateFileProcessingSubscription = useCallback((channel, fileId) => {
    if (!fileId) return;
    
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'excel_files',
        filter: `id=eq.${fileId}`
      },
      (payload) => {
        console.log(`File processing update for ${fileId}:`, payload);
        
        if (payload.new) {
          // Get the new processing status
          const newStatus = mapProcessingStatus(payload.new.processing_status);
          
          // Calculate progress
          let progress = calculateProgressFromStatus(newStatus);
          
          // If file has upload_progress, use that for more accurate progress
          if (payload.new.upload_progress !== null && payload.new.upload_progress !== undefined) {
            if (newStatus === FileProcessingStates.UPLOADING || newStatus === FileProcessingStates.PROCESSING) {
              progress = Math.max(10, Math.min(90, payload.new.upload_progress));
            }
          }
          
          // If processing has chunks info, use that for more accurate progress
          if (newStatus === FileProcessingStates.PROCESSING && payload.new.processed_chunks && payload.new.total_chunks) {
            const chunkProgress = (payload.new.processed_chunks / payload.new.total_chunks) * 100;
            progress = Math.max(30, Math.min(90, chunkProgress));
          }
          
          updateProcessingState(
            newStatus,
            progress,
            getProcessingMessage(newStatus),
            payload.new.error_message
          );
          
          setFileState(prev => ({
            ...prev,
            fileName: payload.new.filename,
            lastUpdated: Date.now()
          }));
          
          // Show toast for completed processing
          if (newStatus === FileProcessingStates.COMPLETED && processingState.status !== FileProcessingStates.COMPLETED) {
            toast.success(`File "${payload.new.filename}" processed successfully`);
            
            // Fetch schema when processing completes
            fetchSchema(fileId, metadata?.selected_sheet);
          }
          
          // Show toast for errors
          if (newStatus === FileProcessingStates.ERROR && processingState.status !== FileProcessingStates.ERROR) {
            toast.error(`Error processing file: ${payload.new.error_message || 'Unknown error'}`);
          }
        }
      }
    );
  }, [fetchSchema, metadata, processingState.status, updateProcessingState]);
  
  // Helper function to fetch file info and update state
  const fetchFileInfoAndUpdate = useCallback(async (fileId: string) => {
    try {
      const { data, error } = await supabase
        .from('excel_files')
        .select('filename, processing_status, error_message')
        .eq('id', fileId)
        .maybeSingle();
        
      if (error) {
        console.error('Error fetching file info:', error);
        return;
      }
      
      if (data) {
        const status = mapProcessingStatus(data.processing_status);
        
        setFileState(prev => ({
          ...prev,
          fileName: data.filename,
          lastUpdated: Date.now()
        }));
        
        updateProcessingState(
          status,
          calculateProgressFromStatus(status),
          getProcessingMessage(status),
          data.error_message
        );
        
        // If file is completed, fetch schema
        if (status === FileProcessingStates.COMPLETED) {
          await fetchSchema(fileId, metadata?.selected_sheet);
        }
      }
    } catch (error) {
      console.error('Error in fetchFileInfoAndUpdate:', error);
    }
  }, [fetchSchema, metadata, updateProcessingState]);
  
  // Upload a file and associate it with the node
  const uploadFile = useCallback(async (file: File): Promise<boolean> => {
    if (!workflowId || !nodeId) {
      toast.error('Cannot upload file: Workflow or node ID missing');
      return false;
    }
    
    try {
      // Update state to show uploading
      updateProcessingState(FileProcessingStates.UPLOADING, 10, 'Uploading file...');
      
      // Generate unique file path
      const filePath = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9-_.]/g, '_')}`;
      
      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });
        
      if (uploadError) {
        console.error('Error uploading file:', uploadError);
        updateProcessingState(FileProcessingStates.ERROR, 0, 'Upload failed', uploadError.message);
        toast.error(`Failed to upload file: ${uploadError.message}`);
        return false;
      }
      
      // Update progress
      updateProcessingState(FileProcessingStates.ASSOCIATING, 30, 'Creating file record...');
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Create file record in database
      const { data: fileRecord, error: dbError } = await supabase
        .from('excel_files')
        .insert({
          filename: file.name,
          file_path: filePath,
          file_size: file.size,
          user_id: user.id,
          processing_status: 'pending',
          mime_type: file.type,
          storage_verified: true,
        })
        .select()
        .single();
        
      if (dbError) {
        console.error('Error creating file record:', dbError);
        updateProcessingState(FileProcessingStates.ERROR, 0, 'File record creation failed', dbError.message);
        toast.error(`Failed to create file record: ${dbError.message}`);
        return false;
      }
      
      // Update state with file ID
      setFileState(prev => ({
        ...prev,
        fileId: fileRecord.id,
        fileName: file.name,
        lastUpdated: Date.now()
      }));
      
      updateProcessingState(FileProcessingStates.ASSOCIATING, 50, 'Associating with workflow...');
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // Associate file with workflow node
      const { error: associationError } = await supabase
        .from('workflow_files')
        .upsert({
          workflow_id: dbWorkflowId,
          node_id: nodeId,
          file_id: fileRecord.id,
          metadata: {
            uploaded_at: new Date().toISOString(),
            original_name: file.name
          }
        }, {
          onConflict: 'workflow_id,node_id'
        });
        
      if (associationError) {
        console.error('Error associating file with node:', associationError);
        updateProcessingState(FileProcessingStates.ERROR, 0, 'Association failed', associationError.message);
        toast.error(`Failed to associate file with node: ${associationError.message}`);
        return false;
      }
      
      // Trigger file processing
      updateProcessingState(FileProcessingStates.QUEUING, 60, 'Queuing file for processing...');
      
      const { error: processingError } = await supabase.functions.invoke('processFile', {
        body: { 
          fileId: fileRecord.id, 
          nodeId, 
          workflowId
        }
      });
      
      if (processingError) {
        console.error('Error triggering file processing:', processingError);
        // Don't set error state here, as we can still continue with the upload
        toast.warning(`File uploaded but processing may be delayed: ${processingError.message}`);
      }
      
      // Update state to processing
      updateProcessingState(FileProcessingStates.PROCESSING, 70, 'Processing file...');
      
      toast.success(`File "${file.name}" uploaded and being processed`);
      return true;
    } catch (error) {
      console.error('Error in uploadFile:', error);
      updateProcessingState(
        FileProcessingStates.ERROR, 
        0, 
        'Upload failed',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
      toast.error(`File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }, [workflowId, nodeId, updateProcessingState]);
  
  // Remove file association from node
  const removeFile = useCallback(async (): Promise<boolean> => {
    if (!workflowId || !nodeId || !fileState.fileId) {
      return false;
    }
    
    try {
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // Remove file association
      const { error } = await supabase
        .from('workflow_files')
        .delete()
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId);
        
      if (error) {
        console.error('Error removing file association:', error);
        toast.error(`Failed to remove file: ${error.message}`);
        return false;
      }
      
      // Reset state
      setFileState({
        nodeId,
        processingState: {
          status: FileProcessingStates.PENDING,
          progress: 0
        },
        lastUpdated: Date.now()
      });
      
      setSchema(undefined);
      setMetadata(undefined);
      
      updateProcessingState(FileProcessingStates.PENDING, 0);
      
      toast.success('File removed successfully');
      return true;
    } catch (error) {
      console.error('Error in removeFile:', error);
      toast.error(`Failed to remove file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }, [workflowId, nodeId, fileState.fileId, updateProcessingState]);
  
  // Update selected sheet
  const updateSelectedSheet = useCallback(async (sheetName: string): Promise<boolean> => {
    if (!workflowId || !nodeId || !fileState.fileId) {
      return false;
    }
    
    try {
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // Get current metadata
      const currentMetadata = { ...metadata } || {};
      
      // Update metadata with selected sheet
      const updatedMetadata = {
        ...currentMetadata,
        selected_sheet: sheetName
      };
      
      // Update workflow file record
      const { error } = await supabase
        .from('workflow_files')
        .update({
          metadata: updatedMetadata
        })
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId);
        
      if (error) {
        console.error('Error updating selected sheet:', error);
        toast.error(`Failed to update selected sheet: ${error.message}`);
        return false;
      }
      
      // Update local state
      setMetadata(updatedMetadata);
      
      // Fetch schema for the selected sheet
      await fetchSchema(fileState.fileId, sheetName);
      
      toast.success(`Sheet "${sheetName}" selected`);
      return true;
    } catch (error) {
      console.error('Error in updateSelectedSheet:', error);
      toast.error(`Failed to update selected sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }, [workflowId, nodeId, fileState.fileId, metadata, fetchSchema]);
  
  // Helper function to map database status to our status type
  const mapProcessingStatus = (status: string | null): FileProcessingState => {
    if (!status) return FileProcessingStates.PENDING;
    
    switch (status) {
      case 'pending':
        return FileProcessingStates.PENDING;
      case 'queued':
        return FileProcessingStates.QUEUING;
      case 'uploading':
        return FileProcessingStates.UPLOADING;
      case 'processing':
        return FileProcessingStates.PROCESSING;
      case 'fetching_schema':
        return FileProcessingStates.FETCHING_SCHEMA;
      case 'verifying':
        return FileProcessingStates.VERIFYING;
      case 'completed':
        return FileProcessingStates.COMPLETED;
      case 'error':
      case 'failed':
        return FileProcessingStates.ERROR;
      default:
        return FileProcessingStates.PENDING;
    }
  };
  
  // Helper function to calculate progress from status
  const calculateProgressFromStatus = (status: FileProcessingState): number => {
    switch (status) {
      case FileProcessingStates.UPLOADING:
        return 20;
      case FileProcessingStates.ASSOCIATING:
        return 40;
      case FileProcessingStates.QUEUING:
        return 60;
      case FileProcessingStates.PROCESSING:
        return 70;
      case FileProcessingStates.FETCHING_SCHEMA:
        return 80;
      case FileProcessingStates.VERIFYING:
        return 90;
      case FileProcessingStates.COMPLETED:
        return 100;
      case FileProcessingStates.ERROR:
      case FileProcessingStates.FAILED:
        return 0;
      default:
        return 0;
    }
  };
  
  // Helper function to get processing message
  const getProcessingMessage = (status: FileProcessingState): string | undefined => {
    switch (status) {
      case FileProcessingStates.UPLOADING:
        return 'Uploading file...';
      case FileProcessingStates.ASSOCIATING:
        return 'Associating file...';
      case FileProcessingStates.QUEUING:
        return 'Queuing file for processing...';
      case FileProcessingStates.PROCESSING:
        return 'Processing file...';
      case FileProcessingStates.FETCHING_SCHEMA:
        return 'Fetching schema...';
      case FileProcessingStates.VERIFYING:
        return 'Verifying file...';
      case FileProcessingStates.COMPLETED:
        return 'File ready';
      case FileProcessingStates.ERROR:
        return 'Error processing file';
      case FileProcessingStates.FAILED:
        return 'File processing failed';
      default:
        return undefined;
    }
  };
  
  return {
    fileState,
    processingState,
    schema,
    metadata,
    uploadFile,
    removeFile,
    updateSelectedSheet,
    isUploading: processingState.status === FileProcessingStates.UPLOADING,
    isProcessing,
    isComplete,
    isError,
    isPending
  };
}
