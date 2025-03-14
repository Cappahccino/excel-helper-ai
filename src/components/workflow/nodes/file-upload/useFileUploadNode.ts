
import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { FileProcessingState } from '@/types/workflowStatus';
import { WorkflowFileStatus } from '@/types/workflowStatus';
import { propagateSchemaDirectly } from '@/utils/schemaPropagation';
import { getNodeSchema } from '@/utils/fileSchemaUtils';

interface SheetMetadata {
  name: string;
  index: number;
  rowCount?: number;
  isDefault?: boolean;
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
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  
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
  const [connectedNodes, setConnectedNodes] = useState<string[]>([]);
  const [lastSchemaUpdate, setLastSchemaUpdate] = useState<number>(0);

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

  const { data: sheetSchema, isLoading: isLoadingSheetSchema } = useQuery({
    queryKey: ['sheet-schema', workflowId, nodeId, selectedSheet, lastSchemaUpdate],
    queryFn: async () => {
      if (!workflowId || !nodeId || !selectedSheet) return null;
      
      setIsLoadingSchema(true);
      try {
        console.log(`Fetching schema for node ${nodeId}, sheet: ${selectedSheet}`);
        const dbWorkflowId = convertToDbWorkflowId(workflowId);
        
        // Use our enhanced getNodeSchema function that properly handles sheets
        const schema = await getNodeSchema(dbWorkflowId, nodeId, { 
          sheetName: selectedSheet,
          forceRefresh: true
        });
        
        if (!schema) {
          console.warn(`No schema found for node ${nodeId}, sheet ${selectedSheet}`);
          return null;
        }
        
        return schema;
      } catch (error) {
        console.error('Error in sheet schema query:', error);
        return null;
      } finally {
        setIsLoadingSchema(false);
      }
    },
    enabled: !!workflowId && !!nodeId && !!selectedSheet,
  });

  const fetchConnectedNodes = useCallback(async () => {
    if (!workflowId || !nodeId) return;

    try {
      console.log(`Fetching connected nodes for ${nodeId} in workflow ${workflowId}`);
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const { data: edges, error } = await supabase
        .from('workflow_edges')
        .select('target_node_id')
        .eq('workflow_id', dbWorkflowId)
        .eq('source_node_id', nodeId);

      if (error) {
        console.error('Error fetching connected nodes:', error);
        return;
      }

      if (edges && edges.length > 0) {
        const targetNodeIds = edges.map(edge => edge.target_node_id);
        console.log(`Found connected nodes: ${targetNodeIds.join(', ')}`);
        setConnectedNodes(targetNodeIds);
      } else {
        console.log('No connected nodes found');
        setConnectedNodes([]);
      }
    } catch (error) {
      console.error('Error in fetchConnectedNodes:', error);
    }
  }, [workflowId, nodeId]);
  
  const propagateSchemaToConnectedNodes = useCallback(async (sheetName: string) => {
    if (!workflowId || !nodeId || connectedNodes.length === 0) return;
    
    try {
      console.log(`Propagating schema from ${nodeId} to ${connectedNodes.length} connected nodes, sheet: ${sheetName}`);
      toast.info(`Propagating schema to ${connectedNodes.length} connected node(s)...`);
      
      let successCount = 0;
      let failedNodes: string[] = [];
      
      for (const targetNodeId of connectedNodes) {
        // Try up to 3 times with exponential backoff
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            console.log(`Propagating schema to ${targetNodeId}, attempt ${attempt + 1}`);
            const success = await propagateSchemaDirectly(workflowId, nodeId, targetNodeId, sheetName);
            
            if (success) {
              successCount++;
              console.log(`Successfully propagated schema to ${targetNodeId}`);
              break; // Exit retry loop on success
            } else if (attempt < 2) {
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
            } else {
              failedNodes.push(targetNodeId);
            }
          } catch (err) {
            console.error(`Error propagating schema to ${targetNodeId}:`, err);
            if (attempt === 2) {
              failedNodes.push(targetNodeId);
            }
          }
        }
      }
      
      if (successCount > 0) {
        if (failedNodes.length === 0) {
          toast.success(`Schema propagated to all ${successCount} node(s)`);
        } else {
          toast.success(`Schema propagated to ${successCount}/${connectedNodes.length} node(s)`);
          console.warn(`Failed to propagate schema to nodes: ${failedNodes.join(', ')}`);
        }
      } else {
        toast.error('Failed to propagate schema to connected nodes');
      }
      
      // Update timestamp to refresh subscribed components
      setLastSchemaUpdate(Date.now());
      
    } catch (error) {
      console.error('Error propagating schema:', error);
      toast.error('Error propagating schema to connected nodes');
    }
  }, [workflowId, nodeId, connectedNodes]);

  // Set up real-time subscription for file status updates
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
            refetch();
            
            // Check if we need to propagate schema after file processing completes
            if (connectedNodes.length > 0 && selectedSheet) {
              // Add a small delay to ensure the schema is ready
              setTimeout(() => {
                propagateSchemaToConnectedNodes(selectedSheet);
              }, 500);
            }
            
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
  }, [workflowId, selectedFileId, nodeId, updateProcessingState, refetch, propagateSchemaToConnectedNodes, connectedNodes, selectedSheet]);

  // Fetch connected nodes when workflow or node changes
  useEffect(() => {
    if (workflowId && nodeId) {
      fetchConnectedNodes();
    }
  }, [workflowId, nodeId, fetchConnectedNodes]);

  // Process sheet information from file metadata
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

  // Update processing state based on file information
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

  // Propagate schema to connected nodes when file processing completes
  useEffect(() => {
    if (
      processingState.status === FileProcessingState.Completed &&
      selectedSheet &&
      connectedNodes.length > 0 &&
      workflowId
    ) {
      const timer = setTimeout(() => {
        propagateSchemaToConnectedNodes(selectedSheet);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [
    processingState.status, 
    selectedSheet, 
    connectedNodes, 
    workflowId, 
    propagateSchemaToConnectedNodes
  ]);

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
      
      setSelectedSheet(undefined);
      
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

  const handleSheetSelection = async (sheetName: string) => {
    if (!workflowId || !nodeId) return;
    
    console.log(`Selecting sheet: ${sheetName}`);
    setSelectedSheet(sheetName);
    
    if (onChange) {
      onChange(nodeId, { 
        ...config,
        selectedSheet: sheetName
      });
    }
    
    // Automatically propagate schema when a sheet is selected
    if (connectedNodes.length > 0) {
      // Add a small delay to ensure state updates
      setTimeout(() => {
        propagateSchemaToConnectedNodes(sheetName);
      }, 300);
    }
  };

  const handleRetry = async () => {
    if (!selectedFileId) return;
    updateProcessingState(FileProcessingState.Associating, 10, 'Retrying file processing...');
    await handleFileSelection(selectedFileId);
  };

  return {
    selectedFileId,
    selectedSheet,
    availableSheets,
    files,
    isLoadingFiles,
    isLoadingSelectedFile,
    isLoadingSchema,
    isLoadingSheetSchema,
    sheetSchema,
    processingState,
    realtimeEnabled,
    fileInfo,
    refetch,
    formatFileSize,
    handleFileSelection,
    handleSheetSelection,
    handleRetry,
    updateProcessingState,
    propagateSchemaToConnectedNodes
  };
};
