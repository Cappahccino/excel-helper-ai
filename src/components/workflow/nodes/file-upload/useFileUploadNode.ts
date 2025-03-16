
import { useState, useCallback, useEffect } from 'react';
import { FileProcessingStates, FileSchemaState } from '@/types/fileProcessing';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';

// Files upload node state
export function useFileUploadNode(props: {
  nodeId: string;
  workflowId?: string;
}) {
  const { nodeId, workflowId } = props;

  // File state
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('pending');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [schema, setSchema] = useState<FileSchemaState | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [availableSheets, setAvailableSheets] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());

  // Loading states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Fetch file state on init
  useEffect(() => {
    if (workflowId && nodeId) {
      fetchFileState();
    }
  }, [workflowId, nodeId]);

  // Fetch file state
  const fetchFileState = useCallback(async () => {
    if (!workflowId || !nodeId) return;

    setIsLoading(true);

    try {
      const dbWorkflowId = convertToDbWorkflowId(workflowId);

      // Get workflow file
      const { data: fileData, error: fileError } = await supabase
        .from('workflow_files')
        .select('file_id, metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();

      if (fileError) {
        console.error('Error fetching file state:', fileError);
        setIsLoading(false);
        return;
      }

      if (fileData && fileData.file_id) {
        setFileId(fileData.file_id);

        // Parse metadata
        if (fileData.metadata) {
          try {
            const metadata = typeof fileData.metadata === 'string' 
              ? JSON.parse(fileData.metadata) 
              : fileData.metadata;
              
            if (metadata.selected_sheet) {
              setSelectedSheet(metadata.selected_sheet);
            }
            
            if (metadata.sheets_metadata && Array.isArray(metadata.sheets_metadata)) {
              setAvailableSheets(metadata.sheets_metadata);
            }
          } catch (err) {
            console.error('Error parsing metadata:', err);
          }
        }

        // Get file info
        const { data: fileInfo, error: infoError } = await supabase
          .from('excel_files')
          .select('filename, processing_status, error_message')
          .eq('id', fileData.file_id)
          .maybeSingle();

        if (infoError) {
          console.error('Error fetching file info:', infoError);
        } else if (fileInfo) {
          setFileName(fileInfo.filename);
          setProcessingStatus(fileInfo.processing_status || 'pending');
          setErrorMessage(fileInfo.error_message);
          
          // Check if processing is complete to fetch schema
          if (fileInfo.processing_status === 'completed') {
            fetchSchema(fileData.file_id, selectedSheet);
          }
          
          // Set processing state
          const isProcessingNow = ['uploading', 'processing', 'queued', 'verifying', 'fetching_schema'].includes(fileInfo.processing_status || '');
          setIsProcessing(isProcessingNow);
          setIsUploading(fileInfo.processing_status === 'uploading');
        }
      }
    } catch (err) {
      console.error('Error in fetchFileState:', err);
    } finally {
      setIsLoading(false);
      setLastUpdated(Date.now());
    }
  }, [workflowId, nodeId, selectedSheet]);

  // Fetch schema
  const fetchSchema = useCallback(async (fileId: string, sheetName?: string | null) => {
    if (!workflowId || !nodeId || !fileId) return;
    
    try {
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      let query = supabase
        .from('workflow_file_schemas')
        .select('columns, data_types, has_headers, sample_data, sheet_name')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .eq('file_id', fileId);
        
      if (sheetName) {
        query = query.eq('sheet_name', sheetName);
      }
      
      const { data, error } = await query.maybeSingle();
      
      if (error) {
        console.error('Error fetching schema:', error);
        return;
      }
      
      if (data) {
        const schemaData: FileSchemaState = {
          columns: data.columns || [],
          dataTypes: data.data_types || {},
          sampleData: data.sample_data,
          sheetName: data.sheet_name,
          hasHeaders: Boolean(data.has_headers)
        };
        
        setSchema(schemaData);
      }
    } catch (err) {
      console.error('Error in fetchSchema:', err);
    }
  }, [workflowId, nodeId]);
  
  // Update selected sheet
  const updateSelectedSheet = useCallback(async (sheetName: string) => {
    if (!workflowId || !nodeId || !fileId) return false;
    
    try {
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // Get current metadata
      const { data: currentData } = await supabase
        .from('workflow_files')
        .select('metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .single();
      
      // Parse and update metadata
      let metadata = {};
      if (currentData?.metadata) {
        if (typeof currentData.metadata === 'string') {
          try { metadata = JSON.parse(currentData.metadata); } 
          catch (e) { console.error('Error parsing metadata:', e); }
        } else {
          metadata = currentData.metadata;
        }
      }
      
      const updatedMetadata = {
        ...metadata,
        selected_sheet: sheetName
      };
      
      // Update metadata in database
      await supabase
        .from('workflow_files')
        .update({ metadata: updatedMetadata })
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId);
      
      setSelectedSheet(sheetName);
      fetchSchema(fileId, sheetName);
      
      return true;
    } catch (err) {
      console.error('Error updating selected sheet:', err);
      return false;
    }
  }, [workflowId, nodeId, fileId, fetchSchema]);
  
  // Check if file is ready
  const isFileReady = processingStatus === 'completed';
  const hasError = processingStatus === 'error' || processingStatus === 'failed';
  
  // Return state and functions
  return {
    fileId,
    fileName,
    processingStatus,
    uploadProgress,
    errorMessage,
    schema,
    selectedSheet,
    availableSheets,
    lastUpdated,
    isLoading,
    isUploading,
    isProcessing,
    isFileReady,
    hasError,
    fetchFileState,
    updateSelectedSheet,
  };
}
