
import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { FileProcessingState } from '@/types/workflowStatus';
import { WorkflowFileStatus } from '@/types/workflowStatus';
import { useFileSchemaManagement } from './useFileSchemaManagement';
import { invalidateWorkflowSchemaCache } from '@/utils/schemaCache';

/**
 * Enhanced hook for FileUploadNode with improved schema handling
 */
export const useFileUploadNodeEnhanced = (
  workflowId: string | null,
  nodeId: string,
  config: any,
  onChange: ((nodeId: string, config: any) => void) | undefined
) => {
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>(
    config?.fileId
  );
  
  const [processingState, setProcessingState] = useState<{
    status: FileProcessingState;
    progress: number;
    message?: string;
    error?: string;
    startTime?: number;
    endTime?: number;
  }>({
    status: FileProcessingState.Pending,
    progress: 0
  });
  
  const [fileInfo, setFileInfo] = useState<any>(null);
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);

  const {
    // Schema management
    schema,
    isLoadingSchema,
    schemaError,
    refreshSchema,
    
    // Sheet management
    selectedSheet,
    availableSheets,
    isLoadingSheets,
    selectSheet,
    
    // Propagation
    connectedNodes,
    isPropagating,
    propagateSchemaToConnectedNodes
  } = useFileSchemaManagement(workflowId, nodeId, selectedFileId, {
    autoPropagate: true,
    showNotifications: true
  });

  const updateProcessingState = useCallback((
    status: FileProcessingState, 
    progress: number = 0, 
    message?: string,
    error?: string
  ) => {
    setProcessingState(prev => ({
      ...prev,
      status,
      progress: status === FileProcessingState.Completed ? 100 : progress,
      message,
      error,
      ...(status === FileProcessingState.Completed ? { endTime: Date.now() } : {}),
      ...(status === FileProcessingState.Associating && !prev.startTime ? { startTime: Date.now() } : {})
    }));
  }, []);

  const { data: files, isLoading: isLoadingFiles, refetch } = useQuery({
    queryKey: ['excel-files-for-workflow'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('excel_files')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load files');
        throw error;
      }

      return data || [];
    },
  });

  const { data: selectedFile, isLoading: isLoadingSelectedFile } = useQuery({
    queryKey: ['excel-file-info', selectedFileId],
    queryFn: async () => {
      if (!selectedFileId) return null;

      const { data, error } = await supabase
        .from('excel_files')
        .select('*, file_metadata(*)')
        .eq('id', selectedFileId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching file info:', error);
        return null;
      }

      return data;
    },
    enabled: !!selectedFileId,
  });

  useEffect(() => {
    if (!workflowId || !selectedFileId || !nodeId) return;
    
    console.log('Setting up realtime subscription for workflow file updates');
    const dbWorkflowId = convertToDbWorkflowId(workflowId);
    
    const channel = supabase
      .channel(`workflow_file_updates_${nodeId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workflow_files',
          filter: `workflow_id=eq.${dbWorkflowId} AND node_id=eq.${nodeId} AND file_id=eq.${selectedFileId}`
        },
        (payload) => {
          console.log('Received realtime update for workflow file:', payload);
          const updatedFile = payload.new;
          
          const processingStatus = updatedFile.processing_status as string;
          
          if (processingStatus === WorkflowFileStatus.Completed) {
            updateProcessingState(FileProcessingState.Completed, 100, 'File processed successfully');
            
            // Refresh file data
            refetch();
            
            // Invalidate schema cache for this workflow
            if (workflowId) {
              invalidateWorkflowSchemaCache(workflowId);
            }
            
            // Refresh schema after a short delay
            setTimeout(() => {
              refreshSchema();
            }, 1000);
          } else if (processingStatus === WorkflowFileStatus.Processing) {
            updateProcessingState(FileProcessingState.Processing, 50, 'Processing file data...');
          } else if (processingStatus === WorkflowFileStatus.Failed || 
                     processingStatus === WorkflowFileStatus.Error) {
            const errorMessage = updatedFile.processing_error || 'File processing failed';
            updateProcessingState(FileProcessingState.Error, 0, 'Error', errorMessage);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to workflow file updates');
          setRealtimeEnabled(true);
        } else {
          console.error('Failed to subscribe to workflow file updates:', status);
          setRealtimeEnabled(false);
        }
      });
    
    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [workflowId, selectedFileId, nodeId, updateProcessingState, refetch, refreshSchema]);

  useEffect(() => {
    if (selectedFile) {
      setFileInfo(selectedFile);
      
      const processingStatus = selectedFile.processing_status as string;
      
      if (processingStatus === WorkflowFileStatus.Completed) {
        updateProcessingState(FileProcessingState.Completed, 100);
      } else if (processingStatus === WorkflowFileStatus.Processing) {
        updateProcessingState(FileProcessingState.Processing, 50, 'Processing file data...');
      } else if (
        processingStatus === WorkflowFileStatus.Failed || 
        processingStatus === WorkflowFileStatus.Error
      ) {
        updateProcessingState(
          FileProcessingState.Error, 
          0, 
          'Error', 
          selectedFile.error_message || 'File processing failed'
        );
      }
    }
  }, [selectedFile, updateProcessingState]);

  const formatFileSize = (sizeInBytes: number): string => {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const associateFileWithWorkflow = async (fileId: string): Promise<boolean> => {
    console.log('Associating file with workflow - Started');
    console.log('File ID:', fileId);
    console.log('Workflow ID:', workflowId);
    console.log('Node ID:', nodeId);
    
    const dbWorkflowId = convertToDbWorkflowId(workflowId || '');
    
    console.log('DB Workflow ID:', dbWorkflowId);
    
    try {
      const { data: workflowExists, error: workflowError } = await supabase
        .from('workflows')
        .select('id')
        .eq('id', dbWorkflowId)
        .maybeSingle();
      
      if (workflowError) {
        console.error('Error checking workflow:', workflowError);
        throw workflowError;
      }
      
      if (!workflowExists) {
        console.error('Workflow does not exist in database:', dbWorkflowId);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User not authenticated');
        }
        
        const { error: createError } = await supabase
          .from('workflows')
          .insert({
            id: dbWorkflowId,
            name: 'New Workflow',
            is_temporary: workflowId?.startsWith('temp-'),
            created_by: user.id,
            definition: JSON.stringify({ nodes: [], edges: [] })
          });
          
        if (createError) {
          console.error('Failed to create workflow:', createError);
          throw createError;
        }
        
        console.log('Created workflow record successfully');
      } else {
        console.log('Workflow exists in database');
      }
      
      const { data: rpcResult, error: rpcError } = await supabase.rpc('associate_file_with_workflow_node', {
        p_file_id: fileId,
        p_workflow_id: dbWorkflowId,
        p_node_id: nodeId
      });
      
      if (rpcError) {
        console.error('Error associating file with RPC:', rpcError);
        
        console.log('Falling back to direct database operation');
        const { data: assocData, error: assocError } = await supabase
          .from('workflow_files')
          .upsert({
            workflow_id: dbWorkflowId,
            node_id: nodeId,
            file_id: fileId,
            status: WorkflowFileStatus.Queued,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'workflow_id,node_id'
          });
          
        if (assocError) {
          console.error('Error associating file with direct operation:', assocError);
          throw assocError;
        }
      } else {
        console.log('RPC association successful, result:', rpcResult);
      }
      
      console.log('File association successful');
      return true;
    } catch (error) {
      console.error('File association failed:', error);
      throw error;
    }
  };

  const handleFileSelection = async (fileId: string) => {
    if (!fileId) return;
    
    try {
      console.log('Debug - Current workflowId:', workflowId);
      if (workflowId?.startsWith('temp-')) {
        console.log('Debug - This is a temporary workflow ID');
        console.log('Debug - Formatted for DB:', workflowId.substring(5));
      } else {
        console.log('Debug - This is a permanent workflow ID');
      }
      
      console.log('Debug - Current nodeId:', nodeId);
      
      if (fileId === selectedFileId && fileInfo && fileInfo.processing_status === WorkflowFileStatus.Completed) {
        return;
      }
      
      updateProcessingState(FileProcessingState.Associating, 10, 'Associating file with workflow...');
      setSelectedFileId(fileId);
      
      if (!workflowId) {
        updateProcessingState(FileProcessingState.Error, 0, 'Error', 'No workflow ID available. Please save the workflow first.');
        toast.error('Cannot associate file with workflow yet. Please save the workflow.');
        return;
      }
      
      console.log(`Associating file ${fileId} with node ${nodeId} in workflow ${workflowId}`);
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const isTemporary = workflowId.startsWith('temp-');
      
      const { data: fileData, error: fileError } = await supabase
        .from('excel_files')
        .select('id, filename, file_path, file_size, mime_type')
        .eq('id', fileId)
        .single();
        
      if (fileError) {
        console.error('Error fetching file data:', fileError);
        updateProcessingState(FileProcessingState.Error, 0, 'Error', `File data error: ${fileError.message}`);
        toast.error('Failed to get file information');
        throw fileError;
      }
      
      if (!fileData || !fileData.file_path) {
        throw new Error('File path is missing or invalid');
      }
      
      console.log(`Downloading file from path: ${fileData.file_path}`);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        updateProcessingState(FileProcessingState.Error, 0, 'Error', 'User not authenticated');
        toast.error('You must be logged in to use this feature');
        throw new Error('User not authenticated');
      }
      
      updateProcessingState(FileProcessingState.Associating, 30, 'Creating database association...');
      
      try {
        const result = await associateFileWithWorkflow(fileId);
        if (!result) {
          console.error('File association failed');
          updateProcessingState(FileProcessingState.Error, 0, 'Error', 'File association failed');
          toast.error('Failed to associate file with workflow node');
          return;
        }
        
        console.log('File association successful');
      } catch (assocError) {
        console.error('Error in association:', assocError);
        updateProcessingState(FileProcessingState.Error, 0, 'Error', `Association error: ${assocError.message || 'Unknown error'}`);
        toast.error('Failed to associate file with workflow node');
        return;
      }
      
      updateProcessingState(FileProcessingState.Queuing, 40, 'Submitting for processing...');
      try {
        const response = await supabase.functions.invoke('processFile', {
          body: {
            fileId,
            workflowId,
            nodeId
          }
        });
        
        if (response.error) {
          console.error('Error invoking processFile function:', response.error);
          updateProcessingState(FileProcessingState.Error, 0, 'Error', `Processing error: ${response.error.message}`);
          toast.error('Failed to queue file for processing');
          throw response.error;
        }
        
        const responseData = response.data;
        if (responseData && responseData.error) {
          console.error('Process file returned error:', responseData.error);
          updateProcessingState(FileProcessingState.Error, 0, 'Error', `Process error: ${responseData.error}`);
          toast.error(responseData.error);
          return;
        }
        
        updateProcessingState(FileProcessingState.FetchingSchema, 60, 'Retrieving file schema...');
        
        if (onChange) {
          onChange(nodeId, { 
            fileId, 
            filename: files?.find(f => f.id === fileId)?.filename,
            selectedSheet: config?.selectedSheet
          });
        }
        
        toast.success('File processing started');
        
        setTimeout(() => {
          if (processingState.status !== FileProcessingState.Completed && processingState.status !== FileProcessingState.Error) {
            updateProcessingState(FileProcessingState.Verifying, 80, 'Verifying data...');
          }
        }, 2000);
      } catch (fnError) {
        console.error('Function call failed:', fnError);
        updateProcessingState(FileProcessingState.Error, 0, 'Error', `API error: ${fnError.message}`);
        toast.error('Error processing file. Please try again.');
      }
    } catch (error) {
      console.error('Error associating file with workflow node:', error);
      toast.error('Failed to associate file with workflow');
      updateProcessingState(FileProcessingState.Error, 0, 'Error', `Error: ${error.message}`);
    }
  };

  const handleSheetSelection = useCallback(async (sheetName: string) => {
    // Use the sheet selection from useFileSchemaManagement
    selectSheet(sheetName);
    
    // Update component config
    if (onChange) {
      onChange(nodeId, {
        ...config,
        selectedSheet: sheetName
      });
    }
  }, [nodeId, config, onChange, selectSheet]);

  const handleRetry = useCallback(async () => {
    if (!selectedFileId) return;
    updateProcessingState(FileProcessingState.Associating, 10, 'Retrying file processing...');
    await handleFileSelection(selectedFileId);
  }, [selectedFileId, handleFileSelection]);

  const handleRefreshSchema = useCallback(async () => {
    if (!selectedFileId || !selectedSheet) return;
    
    toast.info('Refreshing schema...');
    
    try {
      const success = await refreshSchema();
      
      if (success) {
        toast.success('Schema refreshed successfully');
        
        // Propagate schema to connected nodes
        if (connectedNodes.length > 0) {
          await propagateSchemaToConnectedNodes();
        }
      } else {
        toast.error('Failed to refresh schema');
      }
    } catch (error) {
      console.error('Error refreshing schema:', error);
      toast.error('Failed to refresh schema');
    }
  }, [selectedFileId, selectedSheet, refreshSchema, connectedNodes, propagateSchemaToConnectedNodes]);

  return {
    selectedFileId,
    selectedSheet,
    availableSheets,
    files,
    isLoadingFiles,
    isLoadingSelectedFile,
    isLoadingSchema,
    isLoadingSheets,
    schema,
    schemaError,
    processingState,
    realtimeEnabled,
    fileInfo,
    refetch,
    formatFileSize,
    handleFileSelection,
    handleSheetSelection,
    handleRetry,
    handleRefreshSchema,
    connectedNodes,
    isPropagating,
    propagateSchemaToConnectedNodes
  };
};
