import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { WorkflowFileStatus, FileProcessingState } from '@/types/workflowStatus';
import { useFileProcessingState } from '@/hooks/useFileProcessingState';
import { propagateSchemaDirectly } from '@/utils/schemaPropagation';

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
  
  const {
    processingState,
    updateProcessingState,
    resetProcessingState,
    isProcessing,
    isComplete,
    isError,
    isPending,
    isGlowing
  } = useFileProcessingState();
  
  const [fileInfo, setFileInfo] = useState<any>(null);
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);

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
    queryKey: ['sheet-schema', workflowId, nodeId, selectedSheet],
    queryFn: async () => {
      if (!workflowId || !nodeId || !selectedSheet) return null;
      
      setIsLoadingSchema(true);
      try {
        const dbWorkflowId = convertToDbWorkflowId(workflowId);
        
        console.log(`Fetching schema for node ${nodeId}, sheet ${selectedSheet}`);
        
        const { data, error } = await supabase
          .from('workflow_file_schemas')
          .select('columns, data_types, sample_data')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', nodeId)
          .eq('sheet_name', selectedSheet)
          .maybeSingle();
          
        if (error) {
          console.error('Error fetching sheet schema:', error);
          return null;
        }
        
        if (!data) {
          console.log(`No schema found for sheet ${selectedSheet}. This is normal for newly selected sheets.`);
        } else {
          console.log(`Found schema for sheet ${selectedSheet} with ${data.columns.length} columns`);
        }
        
        return data;
      } catch (error) {
        console.error('Error in sheet schema query:', error);
        return null;
      } finally {
        setIsLoadingSchema(false);
      }
    },
    enabled: !!workflowId && !!nodeId && !!selectedSheet,
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
            updateProcessingState('completed', 100, 'File processed successfully', undefined, false);
            refetch();
          } else if (processingStatus === WorkflowFileStatus.Processing) {
            updateProcessingState('processing', 50, 'Processing file data...', undefined, true);
          } else if (processingStatus === WorkflowFileStatus.Failed || 
                     processingStatus === WorkflowFileStatus.Error) {
            const errorMessage = updatedFile.processing_error || 'File processing failed';
            updateProcessingState('error', 0, 'Error', errorMessage, false);
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
  }, [workflowId, selectedFileId, nodeId, updateProcessingState, refetch]);

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

  useEffect(() => {
    if (selectedFile) {
      setFileInfo({
        ...selectedFile,
        isLoading: isLoadingSelectedFile
      });
      
      const processingStatus = selectedFile.processing_status as string;
      
      if (processingStatus === WorkflowFileStatus.Completed) {
        updateProcessingState('completed', 100, undefined, undefined, false);
      } else if (processingStatus === WorkflowFileStatus.Processing) {
        updateProcessingState('processing', 50, 'Processing file data...', undefined, true);
      } else if (
        processingStatus === WorkflowFileStatus.Failed || 
        processingStatus === WorkflowFileStatus.Error
      ) {
        updateProcessingState(
          'error', 
          0, 
          'Error', 
          selectedFile.error_message || 'File processing failed',
          false
        );
      }
    }
  }, [selectedFile, updateProcessingState, isLoadingSelectedFile]);

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
      
      updateProcessingState('associating', 10, 'Associating file with workflow...', undefined, true);
      setSelectedFileId(fileId);
      
      setSelectedSheet(undefined);
      
      if (!workflowId) {
        updateProcessingState('error', 0, 'Error', 'No workflow ID available. Please save the workflow first.', false);
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
        updateProcessingState('error', 0, 'Error', `File data error: ${fileError.message}`, false);
        toast.error('Failed to get file information');
        throw fileError;
      }
      
      if (!fileData || !fileData.file_path) {
        throw new Error('File path is missing or invalid');
      }
      
      console.log(`Downloading file from path: ${fileData.file_path}`);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        updateProcessingState('error', 0, 'Error', 'User not authenticated', false);
        toast.error('You must be logged in to use this feature');
        throw new Error('User not authenticated');
      }
      
      updateProcessingState('associating', 30, 'Creating database association...', undefined, true);
      
      try {
        const result = await associateFileWithWorkflow(fileId);
        if (!result) {
          console.error('File association failed');
          updateProcessingState('error', 0, 'Error', 'File association failed', false);
          toast.error('Failed to associate file with workflow node');
          return;
        }
        
        console.log('File association successful');
      } catch (assocError) {
        console.error('Error in association:', assocError);
        updateProcessingState('error', 0, 'Error', `Association error: ${assocError.message || 'Unknown error'}`, false);
        toast.error('Failed to associate file with workflow node');
        return;
      }
      
      updateProcessingState('queuing', 40, 'Submitting for processing...', undefined, true);
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
          updateProcessingState('error', 0, 'Error', `Processing error: ${response.error.message}`, false);
          toast.error('Failed to queue file for processing');
          throw response.error;
        }
        
        const responseData = response.data;
        if (responseData && responseData.error) {
          console.error('Process file returned error:', responseData.error);
          updateProcessingState('error', 0, 'Error', `Process error: ${responseData.error}`, false);
          toast.error(responseData.error);
          return;
        }
        
        updateProcessingState('fetching_schema', 60, 'Retrieving file schema...', undefined, true);
        
        if (onChange) {
          onChange(nodeId, { 
            fileId, 
            filename: files?.find(f => f.id === fileId)?.filename,
            selectedSheet: config?.selectedSheet
          });
        }
        
        toast.success('File processing started');
        
        setTimeout(() => {
          if (processingState.status !== 'completed' && processingState.status !== 'error') {
            updateProcessingState('verifying', 80, 'Verifying data...', undefined, true);
          }
        }, 2000);
      } catch (fnError) {
        console.error('Function call failed:', fnError);
        updateProcessingState('error', 0, 'Error', `API error: ${fnError.message}`, false);
        toast.error('Error processing file. Please try again.');
      }
    } catch (error) {
      console.error('Error associating file with workflow node:', error);
      toast.error('Failed to associate file with workflow');
      updateProcessingState('error', 0, 'Error', `Error: ${error.message}`, false);
    }
  };

  const handleSheetSelection = useCallback(async (sheetName: string) => {
    console.log(`Setting selected sheet to: ${sheetName}`);
    
    setSelectedSheet(sheetName);
    
    if (!workflowId) {
      console.warn('No workflow ID available, sheet selection will not persist');
      return;
    }
    
    if (onChange) {
      onChange(nodeId, {
        ...config,
        selectedSheet: sheetName
      });
    }
    
    try {
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const { data: currentFile } = await supabase
        .from('workflow_files')
        .select('metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
      
      const currentMetadata = (currentFile?.metadata as Record<string, any>) || {};
      
      const { error } = await supabase
        .from('workflow_files')
        .update({
          metadata: {
            ...currentMetadata,
            selected_sheet: sheetName
          }
        })
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId);
        
      if (error) {
        console.error('Error updating selected sheet in metadata:', error);
        toast.error('Failed to update selected sheet');
      } else {
        console.log(`Successfully updated selected sheet to ${sheetName} in metadata`);
        toast.success(`Sheet "${sheetName}" selected`);
      }
      
      const { data: edges } = await supabase
        .from('workflow_edges')
        .select('target_node_id')
        .eq('workflow_id', dbWorkflowId)
        .eq('source_node_id', nodeId);
        
      if (edges && edges.length > 0) {
        console.log(`Found ${edges.length} connected nodes to update with new sheet selection`);
        
        for (const edge of edges) {
          const targetNodeId = edge.target_node_id;
          console.log(`Propagating schema to ${targetNodeId} with sheet ${sheetName}`);
          
          const success = await propagateSchemaDirectly(workflowId, nodeId, targetNodeId, sheetName);
          if (success) {
            console.log(`Successfully propagated schema to ${targetNodeId} with sheet ${sheetName}`);
          } else {
            console.error(`Failed to propagate schema to ${targetNodeId} with sheet ${sheetName}`);
          }
        }
      }
    } catch (error) {
      console.error('Error handling sheet selection:', error);
      toast.error('Failed to update sheet selection');
    }
  }, [workflowId, nodeId, config, onChange]);

  const handleRetry = useCallback(async () => {
    if (!selectedFileId) return;
    updateProcessingState('associating', 10, 'Retrying file processing...', undefined, true);
    await handleFileSelection(selectedFileId);
  }, [selectedFileId, handleFileSelection, updateProcessingState]);

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
    isProcessing,
    isComplete,
    isError,
    isPending,
    isGlowing
  };
};
