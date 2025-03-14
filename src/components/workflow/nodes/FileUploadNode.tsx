
import React, { useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { Handle, Position } from '@xyflow/react';
import { FileText, Upload, RefreshCw, Database, AlertCircle, Check, Info, Loader2, Table } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { FileUploadNodeData } from '@/types/workflow';
import { WorkflowFileStatus, FileProcessingState, mapWorkflowStatusToProcessingState } from '@/types/workflowStatus';
import { useWorkflow } from '../context/WorkflowContext';
import { useDebounce } from '@/hooks/useDebounce';
import NodeProgress from '../ui/NodeProgress';

interface FileUploadNodeProps {
  id: string;
  selected: boolean;
  data: FileUploadNodeData;
}

// Interface for sheet metadata
interface SheetMetadata {
  name: string;
  index: number;
  rowCount?: number;
  isDefault?: boolean;
}

const FileUploadNode: React.FC<FileUploadNodeProps> = ({ id, data, selected }) => {
  const { workflowId, propagateFileSchema, setNodeSelectedSheet } = useWorkflow();
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>(
    data.config?.fileId
  );
  const debouncedFileId = useDebounce(selectedFileId, 300); // Debounce file ID to prevent flickering
  
  // State for sheet selection
  const [selectedSheet, setSelectedSheet] = useState<string | undefined>(
    data.config?.selectedSheet
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
    queryKey: ['excel-file-info', debouncedFileId], // Use debounced ID to prevent unnecessary queries
    queryFn: async () => {
      if (!debouncedFileId) return null;

      const { data, error } = await supabase
        .from('excel_files')
        .select('*, file_metadata(*)')
        .eq('id', debouncedFileId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching file info:', error);
        return null;
      }

      return data;
    },
    enabled: !!debouncedFileId,
  });

  // Query to fetch sheet-specific schema
  const { data: sheetSchema, isLoading: isLoadingSheetSchema } = useQuery({
    queryKey: ['sheet-schema', workflowId, id, selectedSheet],
    queryFn: async () => {
      if (!workflowId || !id || !selectedSheet) return null;
      
      setIsLoadingSchema(true);
      try {
        const dbWorkflowId = convertToDbWorkflowId(workflowId);
        
        const { data, error } = await supabase
          .from('workflow_file_schemas')
          .select('columns, data_types, sample_data')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', id)
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
    enabled: !!workflowId && !!id && !!selectedSheet,
  });

  // Setup realtime subscription for workflow file updates
  useEffect(() => {
    if (!workflowId || !selectedFileId || !id) return;
    
    console.log('Setting up realtime subscription for workflow file updates');
    const dbWorkflowId = convertToDbWorkflowId(workflowId);
    
    const channel = supabase
      .channel(`workflow_file_updates_${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workflow_files',
          filter: `workflow_id=eq.${dbWorkflowId} AND node_id=eq.${id} AND file_id=eq.${selectedFileId}`
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
  }, [workflowId, selectedFileId, id, updateProcessingState, refetch]);

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
        if (data.onChange) {
          data.onChange(id, { 
            ...data.config,
            selectedSheet: defaultSheet.name
          });
        }
      }
    }
  }, [selectedFile, selectedSheet, id, data]);

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
  
  // Handle sheet selection
  const handleSheetSelection = async (sheetName: string) => {
    if (!workflowId || !id) return;
    
    console.log(`Selecting sheet: ${sheetName}`);
    setSelectedSheet(sheetName);
    
    // Update node configuration
    if (data.onChange) {
      data.onChange(id, { 
        ...data.config,
        selectedSheet: sheetName
      });
    }
    
    // Update selected sheet in database if utility function is available
    if (setNodeSelectedSheet) {
      try {
        const success = await setNodeSelectedSheet(id, sheetName);
        if (!success) {
          console.warn('Failed to update selected sheet in database');
        }
      } catch (error) {
        console.error('Error setting selected sheet:', error);
      }
    }
  };
  
  // Helper function to explicitly associate the file with the workflow
  const associateFileWithWorkflow = async (fileId: string): Promise<boolean> => {
    // Debug logging
    console.log('Associating file with workflow - Started');
    console.log('File ID:', fileId);
    console.log('Workflow ID:', workflowId);
    console.log('Node ID:', id);
    
    // Ensure we're using the correct format for the workflow ID
    const dbWorkflowId = convertToDbWorkflowId(workflowId);
    
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
            is_temporary: workflowId.startsWith('temp-'),
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
        p_node_id: id
      });
      
      if (rpcError) {
        console.error('Error associating file with RPC:', rpcError);
        
        // Fallback to direct database operation
        console.log('Falling back to direct database operation');
        const { data: assocData, error: assocError } = await supabase
          .from('workflow_files')
          .upsert({
            workflow_id: dbWorkflowId,
            node_id: id,
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
      if (workflowId.startsWith('temp-')) {
        console.log('Debug - This is a temporary workflow ID');
        console.log('Debug - Formatted for DB:', workflowId.substring(5));
      } else {
        console.log('Debug - This is a permanent workflow ID');
      }
      
      console.log('Debug - Current nodeId:', id);
      console.log('Debug - Node component props:', { id, data, selected });
      
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
      console.log(`Associating file ${fileId} with node ${id} in workflow ${workflowId}`);
      
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
            nodeId: id
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
        if (data.onChange) {
          data.onChange(id, { 
            fileId, 
            filename: files?.find(f => f.id === fileId)?.filename 
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

  // Function to retry failed processing
  const handleRetry = async () => {
    if (!selectedFileId) return;
    updateProcessingState(FileProcessingState.Associating, 10, 'Retrying file processing...');
    await handleFileSelection(selectedFileId);
  };

  // Get file schema columns
  const getSchemaInfo = () => {
    // If we're loading the schema, show a loading indicator
    if (isLoadingSchema || isLoadingSheetSchema) {
      return (
        <div className="mt-3 border-t pt-2">
          <h4 className="text-xs font-semibold mb-1 flex items-center">
            <Database className="h-3 w-3 mr-1" /> Loading Schema...
          </h4>
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        </div>
      );
    }
    
    // If no sheet is selected, prompt the user
    if (!selectedSheet && availableSheets.length > 0) {
      return (
        <div className="mt-3 border-t pt-2">
          <div className="bg-blue-50 p-2 rounded-md text-xs text-blue-700 border border-blue-100">
            <p>Please select a sheet to view its schema.</p>
          </div>
        </div>
      );
    }
    
    // Use the sheet-specific schema from the query
    if (sheetSchema) {
      const columns = sheetSchema.columns.map((name: string, index: number) => ({
        name,
        type: sheetSchema.data_types[name] || 'string'
      }));
      
      if (!columns.length) return null;
      
      return (
        <div className="mt-3 border-t pt-2">
          <h4 className="text-xs font-semibold mb-1 flex items-center">
            <Table className="h-3 w-3 mr-1" /> Sheet Schema: {selectedSheet}
          </h4>
          <div className="max-h-28 overflow-y-auto pr-1 custom-scrollbar">
            {columns.map((column, index) => (
              <div 
                key={index} 
                className="text-xs flex gap-2 items-center p-1 border-b border-gray-100 last:border-0"
              >
                <span className="font-medium truncate max-w-28">{column.name}</span>
                <Badge variant="outline" className="h-5 text-[10px]">
                  {column.type}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    // Fallback to file metadata if sheet-specific schema is not available
    if (!fileInfo?.file_metadata?.column_definitions) return null;
    
    const columnDefs = fileInfo.file_metadata.column_definitions;
    const columns = Object.keys(columnDefs).map(key => ({
      name: key,
      type: columnDefs[key] || 'string'
    }));
    
    if (!columns.length) return null;
    
    return (
      <div className="mt-3 border-t pt-2">
        <h4 className="text-xs font-semibold mb-1">File Schema (from metadata)</h4>
        <div className="max-h-28 overflow-y-auto pr-1 custom-scrollbar">
          {columns.map((column, index) => (
            <div 
              key={index} 
              className="text-xs flex gap-2 items-center p-1 border-b border-gray-100 last:border-0"
            >
              <span className="font-medium truncate max-w-28">{column.name}</span>
              <Badge variant="outline" className="h-5 text-[10px]">
                {column.type}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Function to render processing status indicator
  const renderProcessingStatus = () => {
    const { status, progress, message, error } = processingState;
    
    // Status-specific colors for progress
    const statusMap: Record<FileProcessingState, {
      statusComponent: React.ReactNode,
      progressStatus: 'default' | 'success' | 'error' | 'warning' | 'info'
    }> = {
      pending: {
        statusComponent: null,
        progressStatus: 'default'
      },
      associating: {
        statusComponent: (
          <div className="flex items-center gap-2 text-xs text-blue-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{message || 'Associating file...'}</span>
          </div>
        ),
        progressStatus: 'default'
      },
      queuing: {
        statusComponent: (
          <div className="flex items-center gap-2 text-xs text-blue-600">
            <Upload className="h-3 w-3 animate-pulse" />
            <span>{message || 'Queuing file...'}</span>
          </div>
        ),
        progressStatus: 'default'
      },
      processing: {
        statusComponent: (
          <div className="flex items-center gap-2 text-xs text-blue-600">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>{message || 'Processing file...'}</span>
          </div>
        ),
        progressStatus: 'default'
      },
      fetching_schema: {
        statusComponent: (
          <div className="flex items-center gap-2 text-xs text-sky-600">
            <Database className="h-3 w-3 animate-pulse" />
            <span>{message || 'Fetching schema...'}</span>
          </div>
        ),
        progressStatus: 'info'
      },
      verifying: {
        statusComponent: (
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>{message || 'Verifying data...'}</span>
          </div>
        ),
        progressStatus: 'warning'
      },
      completed: {
        statusComponent: (
          <div className="flex items-center gap-2 text-xs text-green-600">
            <Check className="h-3 w-3" />
            <span>{message || 'File ready'}</span>
          </div>
        ),
        progressStatus: 'success'
      },
      failed: {
        statusComponent: (
          <div className="bg-red-50 p-2 rounded-md border border-red-100 text-xs text-red-600 flex items-start gap-2">
            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium">Error:</span> {error || 'Processing failed'}
            </div>
          </div>
        ),
        progressStatus: 'error'
      },
      error: {
        statusComponent: (
          <div className="bg-red-50 p-2 rounded-md border border-red-100 text-xs text-red-600 flex items-start gap-2">
            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium">Error:</span> {error || 'Unknown error occurred'}
            </div>
          </div>
        ),
        progressStatus: 'error'
      }
    };
    
    const { statusComponent, progressStatus } = statusMap[status];
    
    return (
      <>
        {statusComponent}
        {status !== FileProcessingState.Pending && status !== FileProcessingState.Completed && 
         status !== FileProcessingState.Error && status !== FileProcessingState.Failed && (
          <NodeProgress 
            value={progress} 
            status={progressStatus} 
            showLabel={true} 
            className="mt-2" 
          />
        )}
        {(status === FileProcessingState.Error || status === FileProcessingState.Failed) && (
          <Button 
            size="sm" 
            variant="outline" 
            className="mt-2 w-full text-xs h-7"
            onClick={handleRetry}
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        )}
      </>
    );
  };

  return (
    <div className={`p-4 rounded-md border-2 ${selected ? 'border-primary' : 'border-gray-200'} bg-white shadow-md w-72`}>
      <Handle type="target" position={Position.Top} id="in" />
      <Handle type="source" position={Position.Bottom} id="out" />
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-blue-100">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <h3 className="font-medium text-sm">{data.label || 'File Upload'}</h3>
        </div>
        
        <div className="flex items-center">
          {realtimeEnabled && (
            <Badge 
              variant="outline" 
              className="h-5 mr-1 bg-green-50 text-green-700 border-green-200 text-[9px]"
            >
              live
            </Badge>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 w-6 p-0" 
            onClick={() => refetch()}
            disabled={processingState.status !== FileProcessingState.Pending && processingState.status !== FileProcessingState.Completed && processingState.status !== FileProcessingState.Error}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
      
      <div className="space-y-3">
        <div>
          <Label htmlFor="fileSelect" className="text-xs font-medium">
            Select File
          </Label>
          
          {isLoadingFiles ? (
            <Skeleton className="h-9 w-full mt-1" />
          ) : (
            <Select 
              value={selectedFileId} 
              onValueChange={handleFileSelection}
              disabled={processingState.status !== FileProcessingState.Pending && processingState.status !== FileProcessingState.Completed && processingState.status !== FileProcessingState.Error}
            >
              <SelectTrigger id="fileSelect" className="mt-1">
                <SelectValue placeholder="Choose a file..." />
              </SelectTrigger>
              <SelectContent>
                {files?.length === 0 ? (
                  <div className="py-6 px-2 text-center">
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No files found</p>
                  </div>
                ) : (
                  files?.map((file) => (
                    <SelectItem key={file.id} value={file.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate max-w-[180px]">{file.filename}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        </div>
        
        {/* Sheet selector - Show only when file is processed successfully */}
        {selectedFileId && processingState.status === FileProcessingState.Completed && availableSheets.length > 0 && (
          <div>
            <Label htmlFor="sheetSelect" className="text-xs font-medium">
              Select Sheet
            </Label>
            <Select 
              value={selectedSheet} 
              onValueChange={handleSheetSelection}
            >
              <SelectTrigger id="sheetSelect" className="mt-1">
                <SelectValue placeholder="Choose a sheet..." />
              </SelectTrigger>
              <SelectContent>
                {availableSheets.map((sheet) => (
                  <SelectItem key={sheet.index} value={sheet.name}>
                    <div className="flex items-center gap-2">
                      <Table className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate max-w-[180px]">{sheet.name}</span>
                      {sheet.rowCount > 0 && (
                        <span className="text-xs text-gray-500">({sheet.rowCount} rows)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        {renderProcessingStatus()}
        
        {selectedFileId && fileInfo && processingState.status === FileProcessingState.Completed && !isLoadingSelectedFile && (
          <div className="bg-gray-50 p-2 rounded-md border border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-gray-500" />
              <h4 className="font-medium text-xs truncate">{fileInfo.filename}</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
              <div className="flex items-center gap-1">
                <Upload className="h-3 w-3" />
                <span>{formatFileSize(fileInfo.file_size || 0)}</span>
              </div>
              
              <div className="flex items-center gap-1">
                <Database className="h-3 w-3" />
                <span>
                  {fileInfo.file_metadata?.row_count 
                    ? `${fileInfo.file_metadata.row_count} rows` 
                    : 'Unknown size'}
                </span>
              </div>
            </div>
            
            {fileInfo.processing_status !== 'completed' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-600">
                <Info className="h-3 w-3" />
                <span>Status: {fileInfo.processing_status}</span>
              </div>
            )}
            
            {getSchemaInfo()}
          </div>
        )}
        
        {!selectedFileId && !isLoadingFiles && (
          <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-700 border border-blue-100">
            <p>Select a file to use in this workflow. You can upload files in the Files section.</p>
          </div>
        )}
        
        {workflowId && (
          <div className="mt-2 text-[10px] text-gray-400 overflow-hidden text-ellipsis">
            {workflowId.startsWith('temp-') ? 'Temporary workflow: ' : 'Workflow: '}
            {workflowId.length > 20 ? `${workflowId.substring(0, 20)}...` : workflowId}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploadNode;
