
import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { FileProcessingState } from '@/types/workflowStatus';
import { WorkflowFileStatus } from '@/types/workflowStatus';
import { ExcelFile } from '@/types/files';
import { useDebounce } from '@/hooks/useDebounce';

interface SheetMetadata {
  name: string;
  index: number;
  rowCount?: number;
  isDefault?: boolean;
}

interface FileUploadNodeState {
  selectedFileId?: string;
  selectedSheet?: string;
  availableSheets: SheetMetadata[];
  files: ExcelFile[] | undefined;
  isLoadingFiles: boolean;
  isLoadingSelectedFile: boolean;
  processingState: {
    status: FileProcessingState;
    progress: number;
    message?: string;
    error?: string;
    startTime?: number;
    endTime?: number;
  };
  realtimeEnabled: boolean;
  fileInfo: any;
  sheetSchema: any;
}

export const useFileUploadNode = (
  workflowId: string | null,
  nodeId: string,
  config: any,
  onChange: ((nodeId: string, config: any) => void) | undefined
) => {
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>(
    config?.fileId
  );
  
  const [selectedSheet, setSelectedSheet] = useState<string | undefined>(
    config?.selectedSheet
  );
  const [availableSheets, setAvailableSheets] = useState<SheetMetadata[]>([]);
  
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
  const [retryCount, setRetryCount] = useState(0);
  
  // Debounce the selected file ID to prevent rapid changes
  const debouncedFileId = useDebounce(selectedFileId, 300);

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

  // Query to fetch the list of available files
  const { 
    data: files, 
    isLoading: isLoadingFiles, 
    refetch: refetchFiles,
    error: filesError
  } = useQuery({
    queryKey: ['excel-files-for-workflow', retryCount],
    queryFn: async () => {
      try {
        console.log('Fetching list of Excel files');
        
        const { data, error } = await supabase
          .from('excel_files')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Failed to load files:', error);
          toast.error('Failed to load files');
          throw error;
        }

        if (!data || data.length === 0) {
          console.log('No files found');
        } else {
          console.log(`Found ${data.length} files`);
        }

        return data || [];
      } catch (error) {
        console.error('Error in excel-files-for-workflow query:', error);
        return [];
      }
    },
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 30000, // 30 seconds
    retry: 3,
    retryDelay: attempt => Math.min(attempt > 1 ? 2000 : 1000, 30000),
  });

  // Query to fetch information about the selected file
  const { 
    data: selectedFile, 
    isLoading: isLoadingSelectedFile,
    refetch: refetchSelectedFile
  } = useQuery({
    queryKey: ['excel-file-info', debouncedFileId, retryCount],
    queryFn: async () => {
      if (!debouncedFileId) return null;

      try {
        console.log(`Fetching info for file ${debouncedFileId}`);

        const { data, error } = await supabase
          .from('excel_files')
          .select('*, file_metadata(*)')
          .eq('id', debouncedFileId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching file info:', error);
          return null;
        }

        if (!data) {
          console.log(`No data found for file ${debouncedFileId}`);
          return null;
        }

        console.log('File info loaded successfully');
        return data;
      } catch (error) {
        console.error('Error in excel-file-info query:', error);
        return null;
      }
    },
    enabled: !!debouncedFileId,
    staleTime: 30000,
    retry: 3,
    retryDelay: attempt => Math.min(attempt > 1 ? 2000 : 1000, 30000),
  });

  // Simple query for sheet schema to display in UI
  const { data: sheetSchema } = useQuery({
    queryKey: ['basic-sheet-schema', workflowId, nodeId, selectedSheet, retryCount],
    queryFn: async () => {
      if (!workflowId || !nodeId || !selectedSheet) return null;
      
      try {
        console.log(`Fetching schema for node ${nodeId}, sheet ${selectedSheet}`);
        
        const dbWorkflowId = convertToDbWorkflowId(workflowId);
        
        const { data, error } = await supabase
          .from('workflow_file_schemas')
          .select('columns, data_types')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', nodeId)
          .eq('sheet_name', selectedSheet)
          .maybeSingle();
          
        if (error) {
          console.error('Error fetching sheet schema:', error);
          return null;
        }
        
        if (!data) {
          console.log(`No schema found for sheet ${selectedSheet}`);
          return null;
        }
        
        console.log(`Schema found for sheet ${selectedSheet} with ${data.columns?.length || 0} columns`);
        return data;
      } catch (error) {
        console.error('Error in basic sheet schema query:', error);
        return null;
      }
    },
    enabled: !!workflowId && !!nodeId && !!selectedSheet,
    staleTime: 30000,
    retry: 3,
  });

  // Setup realtime subscription for workflow file updates
  useEffect(() => {
    if (!workflowId || !selectedFileId || !nodeId) return;
    
    console.log('Setting up realtime subscription for workflow file updates');
    const dbWorkflowId = convertToDbWorkflowId(workflowId);
    
    try {
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
              refetchSelectedFile();
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
    } catch (error) {
      console.error('Error setting up realtime subscription:', error);
      setRealtimeEnabled(false);
      return () => {};
    }
  }, [workflowId, selectedFileId, nodeId, updateProcessingState, refetchSelectedFile]);

  // Process metadata and set available sheets
  useEffect(() => {
    if (selectedFile?.file_metadata) {
      const metadata = selectedFile.file_metadata;
      
      let sheets: SheetMetadata[] = [];
      
      if (metadata.sheets_metadata && Array.isArray(metadata.sheets_metadata)) {
        sheets = metadata.sheets_metadata.map((sheet: any) => ({
          name: sheet.name,
          index: sheet.index,
          rowCount: sheet.row_count || sheet.rowCount || 0,
          isDefault: sheet.is_default || sheet.isDefault || false
        }));
      }
      
      console.log('Available sheets:', sheets);
      setAvailableSheets(sheets);
      
      if (!selectedSheet && sheets.length > 0) {
        const defaultSheet = sheets.find(s => s.isDefault) || sheets[0];
        setSelectedSheet(defaultSheet.name);
        
        if (onChange) {
          onChange(nodeId, { 
            ...config,
            selectedSheet: defaultSheet.name
          });
        }
      }
    }
  }, [selectedFile, selectedSheet, nodeId, config, onChange]);

  // Update file info and processing state when selected file changes
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

  // Helper function to format file size
  const formatFileSize = (sizeInBytes: number): string => {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Associate file with workflow in the database
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
        const { error: assocError } = await supabase
          .from('workflow_files')
          .upsert({
            workflow_id: dbWorkflowId,
            node_id: nodeId,
            file_id: fileId,
            processing_status: WorkflowFileStatus.Queued,
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

  // Handler for file selection in the dropdown
  const handleFileSelection = async (fileId: string) => {
    if (!fileId) return;
    
    try {
      if (fileId === selectedFileId && fileInfo && fileInfo.processing_status === WorkflowFileStatus.Completed) {
        return;
      }
      
      updateProcessingState(FileProcessingState.Associating, 10, 'Associating file with workflow...');
      setSelectedFileId(fileId);
      
      // Reset sheet selection
      setSelectedSheet(undefined);
      
      if (!workflowId) {
        updateProcessingState(FileProcessingState.Error, 0, 'Error', 'No workflow ID available. Please save the workflow first.');
        toast.error('Cannot associate file with workflow yet. Please save the workflow.');
        return;
      }
      
      console.log(`Associating file ${fileId} with node ${nodeId} in workflow ${workflowId}`);
      
      // Store file ID in node config
      if (onChange) {
        onChange(nodeId, {
          ...config,
          fileId: fileId,
          selectedSheet: undefined
        });
      }
      
      // Associate file with workflow
      await associateFileWithWorkflow(fileId);
      
      updateProcessingState(FileProcessingState.Processing, 40, 'Processing file data...');
      
      // Fetch the updated file info
      refetchSelectedFile();
      
    } catch (error) {
      console.error('Error selecting file:', error);
      updateProcessingState(FileProcessingState.Error, 0, 'Error', error.message || 'Failed to select file');
      toast.error('Failed to associate file with workflow');
    }
  };

  // Handler for sheet selection in the dropdown
  const handleSheetSelection = (sheet: string) => {
    setSelectedSheet(sheet);
    
    // Update node config
    if (onChange) {
      onChange(nodeId, {
        ...config,
        selectedSheet: sheet
      });
    }
  };

  // Handler for retrying file association after an error
  const handleRetry = async () => {
    if (!selectedFileId || !workflowId) return;
    
    updateProcessingState(FileProcessingState.Associating, 10, 'Retrying file association...');
    
    try {
      setRetryCount(prev => prev + 1);
      await associateFileWithWorkflow(selectedFileId);
      updateProcessingState(FileProcessingState.Processing, 40, 'Processing file data...');
      refetchSelectedFile();
    } catch (error) {
      console.error('Error retrying file association:', error);
      updateProcessingState(FileProcessingState.Error, 0, 'Error', error.message || 'Failed to retry file association');
      toast.error('Failed to retry file association');
    }
  };

  // Combined refetch function for all data
  const refetch = useCallback(() => {
    console.log('Refetching all data');
    refetchFiles();
    if (selectedFileId) {
      refetchSelectedFile();
    }
    setRetryCount(prev => prev + 1);
  }, [refetchFiles, refetchSelectedFile, selectedFileId]);

  return {
    selectedFileId,
    selectedSheet,
    availableSheets,
    files,
    isLoadingFiles,
    isLoadingSelectedFile,
    processingState,
    realtimeEnabled,
    fileInfo,
    sheetSchema,
    refetch,
    formatFileSize,
    handleFileSelection,
    handleSheetSelection,
    handleRetry
  };
};
