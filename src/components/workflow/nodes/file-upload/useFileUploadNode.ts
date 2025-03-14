import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { FileProcessingState } from '@/types/workflowStatus';
import { WorkflowFileStatus } from '@/types/workflowStatus';
import { propagateSchemaDirectly } from '@/utils/schemaPropagation';

// Interface for sheet metadata
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
  
  // State for sheet selection
  const [selectedSheet, setSelectedSheet] = useState<string | undefined>(
    config?.selectedSheet
  );
  const [availableSheets, setAvailableSheets] = useState<SheetMetadata[]>([]);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  
  // Enhanced processing state
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

  // Function to update processing state
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

  // Query to fetch available files
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

  // Query to get selected file info
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

  // Query to fetch sheet-specific schema
  const { data: sheetSchema, isLoading: isLoadingSheetSchema } = useQuery({
    queryKey: ['sheet-schema', workflowId, nodeId, selectedSheet],
    queryFn: async () => {
      if (!workflowId || !nodeId || !selectedSheet) return null;
      
      setIsLoadingSchema(true);
      try {
        const dbWorkflowId = convertToDbWorkflowId(workflowId);
        
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

  // Setup realtime subscription for workflow file updates
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
          
          // Update processing status based on the realtime update
          // Convert string status to enum for comparison
          const processingStatus = updatedFile.processing_status as string;
          
          if (processingStatus === WorkflowFileStatus.Completed) {
            updateProcessingState(FileProcessingState.Completed, 100, 'File processed successfully');
            // Refresh file info
            refetch();
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
    
    // Cleanup subscription
    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [workflowId, selectedFileId, nodeId, updateProcessingState, refetch]);

  // Load available sheets when file info changes
  useEffect(() => {
    if (selectedFile?.file_metadata) {
      const metadata = selectedFile.file_metadata;
      
      // Extract sheets metadata
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
      
      // Set default sheet if none selected
      if (!selectedSheet && sheets.length > 0) {
        const defaultSheet = sheets.find(s => s.isDefault) || sheets[0];
        setSelectedSheet(defaultSheet.name);
        
        // Update node configuration
        if (onChange) {
          onChange(nodeId, { 
            ...config,
            selectedSheet: defaultSheet.name
          });
        }
      }
    }
  }, [selectedFile, selectedSheet, nodeId, config, onChange]);

  // Update file info when selected file changes
  useEffect(() => {
    if (selectedFile) {
      setFileInfo(selectedFile);
      
      // Update processing state based on file status
      // Compare with string values from the enum
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

  // Format file size for display
  const formatFileSize = (sizeInBytes: number): string => {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Helper function to explicitly associate the file with the workflow
  const associateFileWithWorkflow = async (fileId: string): Promise<boolean> => {
    // Debug logging
    console.log('Associating file with workflow - Started');
    console.log('File ID:', fileId);
    console.log('Workflow ID:', workflowId);
    console.log('Node ID:', nodeId);
    
    // Ensure we're using the correct format for the workflow ID
    const dbWorkflowId = convertToDbWorkflowId(workflowId || '');
    
    console.log('DB Workflow ID:', dbWorkflowId);
    
    try {
      // First check if the workflow exists
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
        
        // Get user for the file operation
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User not authenticated');
        }
        
        // Try to create the workflow
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
      
      // Now create/update the association using our new RPC function
      const { data: rpcResult, error: rpcError } = await supabase.rpc('associate_file_with_workflow_node', {
        p_file_id: fileId,
        p_workflow_id: dbWorkflowId,
        p_node_id: nodeId
      });
      
      if (rpcError) {
        console.error('Error associating file with RPC:', rpcError);
        
        // Fallback to direct database operation
        console.log('Falling back to direct database operation');
        const { data: assocData, error: assocError } = await supabase
          .from('workflow_files')
          .upsert({
            workflow_id: dbWorkflowId,
            node_id: nodeId,
            file_id: fileId,
            status: WorkflowFileStatus.Queued, // Use the correct status value
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

  // Handle file selection using transaction approach
  const handleFileSelection = async (fileId: string) => {
    if (!fileId) return;
    
    try {
      // Debug logging
      console.log('Debug - Current workflowId:', workflowId);
      if (workflowId?.startsWith('temp-')) {
        console.log('Debug - This is a temporary workflow ID');
        console.log('Debug - Formatted for DB:', workflowId.substring(5));
      } else {
        console.log('Debug - This is a permanent workflow ID');
      }
      
      console.log('Debug - Current nodeId:', nodeId);
      
      // Skip processing if this file is already selected and processed
      if (fileId === selectedFileId && fileInfo && fileInfo.processing_status === WorkflowFileStatus.Completed) {
        return;
      }
      
      // Update UI state immediately
      updateProcessingState(FileProcessingState.Associating, 10, 'Associating file with workflow...');
      setSelectedFileId(fileId);
      
      // Reset selected sheet when changing files
      setSelectedSheet(undefined);
      
      // Validate workflow ID availability
      if (!workflowId) {
        updateProcessingState(FileProcessingState.Error, 0, 'Error', 'No workflow ID available. Please save the workflow first.');
        toast.error('Cannot associate file with workflow yet. Please save the workflow.');
        return;
      }
      
      // Log the workflow ID for debugging
      console.log(`Associating file ${fileId} with node ${nodeId} in workflow ${workflowId}`);
      
      // Get the database-compatible workflow ID
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // Determine if this is a temporary workflow
      const isTemporary = workflowId.startsWith('temp-');
      
      // Get the file info before processing
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
      
      // Get current user for the file operation
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        updateProcessingState(FileProcessingState.Error, 0, 'Error', 'User not authenticated');
        toast.error('You must be logged in to use this feature');
        throw new Error('User not authenticated');
      }
      
      // Update processing state to indicate file association
      updateProcessingState(FileProcessingState.Associating, 30, 'Creating database association...');
      
      // Try to use our association function
      console.log('Attempting to associate file with workflow node using RPC function');
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
      
      // Queue the file for processing
      updateProcessingState(FileProcessingState.Queuing, 40, 'Submitting for processing...');
      try {
        const response = await supabase.functions.invoke('processFile', {
          body: {
            fileId,
            workflowId, // Send workflow ID as-is, processFile will handle normalization
            nodeId
          }
        });
        
        if (response.error) {
          console.error('Error invoking processFile function:', response.error);
          updateProcessingState(FileProcessingState.Error, 0, 'Error', `Processing error: ${response.error.message}`);
          toast.error('Failed to queue file for processing');
          throw response.error;
        }
        
        // Check for error in the successful response body
        const responseData = response.data;
        if (responseData && responseData.error) {
          console.error('Process file returned error:', responseData.error);
          updateProcessingState(FileProcessingState.Error, 0, 'Error', `Process error: ${responseData.error}`);
          toast.error(responseData.error);
          return;
        }
        
        // Update processing state to fetching schema
        updateProcessingState(FileProcessingState.FetchingSchema, 60, 'Retrieving file schema...');
        
        // Update node configuration
        if (onChange) {
          onChange(nodeId, { 
            fileId, 
            filename: files?.find(f => f.id === fileId)?.filename,
            selectedSheet: config?.selectedSheet
          });
        }
        
        toast.success('File processing started');
        
        // Delay to fetch schema data (realtime subscription will update status)
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

  // Handle sheet selection with schema propagation
  const handleSheetSelection = async (sheetName: string) => {
    if (!workflowId || !nodeId) return;
    
    console.log(`Selecting sheet: ${sheetName}`);
    setSelectedSheet(sheetName);
    
    try {
      // Update node configuration
      if (onChange) {
        onChange(nodeId, { 
          ...config,
          selectedSheet: sheetName
        });
      }
      
      // Update the selected sheet in the database
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const { error: updateError } = await supabase
        .from('workflow_files')
        .update({
          metadata: {
            selected_sheet: sheetName
          }
        })
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId);
        
      if (updateError) {
        console.error('Error updating selected sheet in database:', updateError);
        // Non-critical, continue
      } else {
        console.log(`Successfully updated selected sheet to ${sheetName} in database for node ${nodeId}`);
      }
      
      // If the file is already processed, trigger schema propagation to connected nodes
      if (processingState.status === FileProcessingState.Completed && selectedFileId) {
        console.log(`Attempting to propagate schema for newly selected sheet ${sheetName}`);
        
        // Get edges to find connected nodes
        const { data: edges, error: edgesError } = await supabase
          .from('workflow_edges')
          .select('target_node_id')
          .eq('workflow_id', dbWorkflowId)
          .eq('source_node_id', nodeId);
          
        if (edgesError) {
          console.error('Error fetching edges:', edgesError);
        } else if (edges && edges.length > 0) {
          console.log(`Found ${edges.length} connected nodes to propagate schema to`);
          
          // Propagate schema to each connected node
          for (const edge of edges) {
            const targetNodeId = edge.target_node_id;
            console.log(`Propagating schema to node ${targetNodeId}`);
            
            try {
              const success = await propagateSchemaDirectly(workflowId, nodeId, targetNodeId, sheetName);
              console.log(`Schema propagation to ${targetNodeId} ${success ? 'succeeded' : 'failed'}`);
            } catch (propagateError) {
              console.error(`Error propagating schema to node ${targetNodeId}:`, propagateError);
            }
          }
        } else {
          console.log('No connected nodes found to propagate schema to');
        }
      }
    } catch (error) {
      console.error('Error in handleSheetSelection:', error);
      toast.error('Failed to update sheet selection');
    }
  };

  // Function to retry failed processing
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
    updateProcessingState
  };
};
