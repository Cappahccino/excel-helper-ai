
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { WorkflowFileStatus } from '@/types/workflowStatus';
import { FileProcessingState as UIFileProcessingState } from '@/types/workflowStatus';
import { useFileProcessingState } from '@/hooks/useFileProcessingState';
import { useFileQueries } from '@/hooks/workflow/useFileQueries';
import { useFileProcessing } from '@/hooks/workflow/useFileProcessing';
import { useSheetSelection } from '@/hooks/workflow/useSheetSelection';
import { useFileRealtime } from '@/hooks/workflow/useFileRealtime';
import { useFileAssociation } from '@/hooks/workflow/useFileAssociation';

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
  // Use refs to track stable values without causing re-renders
  const configRef = useRef(config);
  configRef.current = config;
  
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>(config?.fileId);
  const [selectedSheet, setSelectedSheet] = useState<string | undefined>(config?.selectedSheet);
  const [availableSheets, setAvailableSheets] = useState<SheetMetadata[]>([]);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [fileInfo, setFileInfo] = useState<any>(null);
  
  // Additional refs for selection stability
  const fileSelectionInProgressRef = useRef(false);
  const pendingFileIdRef = useRef<string | undefined>(undefined);
  
  // Check if we have a selected file - only activate processing state if we do
  const hasSelectedFile = Boolean(selectedFileId);
  
  // Initialize the file processing state with conditional activation
  const { 
    processingState, 
    updateProcessingState, 
    enhancedState, 
    loadingIndicatorState 
  } = useFileProcessingState({
    status: hasSelectedFile ? UIFileProcessingState.Pending : UIFileProcessingState.Pending,
    progress: 0
  }, hasSelectedFile); // Only activate processing state when we have a file

  // Use our queries hook to fetch data with stabilized deps
  const {
    files,
    isLoadingFiles,
    refetch,
    selectedFile,
    isLoadingSelectedFile,
    sheetSchema,
    isLoadingSheetSchema
  } = useFileQueries(workflowId, nodeId, selectedFileId, selectedSheet);

  // Use our realtime hook for live updates - conditionally activate based on file selection
  const { realtimeEnabled } = useFileRealtime(
    hasSelectedFile ? workflowId : null, 
    hasSelectedFile ? nodeId : '', 
    selectedFileId, 
    (status, progress, message, error) => {
      // Only update if not in the middle of selection
      if (!fileSelectionInProgressRef.current) {
        updateProcessingState(status, progress, message, error);
      }
    }, 
    refetch
  );

  // Use our file processing hook with conditional updating
  const { processFile } = useFileProcessing(
    workflowId, 
    nodeId, 
    (status, progress, message, error) => {
      // Only update processing state when we have a file selected
      if (hasSelectedFile && !fileSelectionInProgressRef.current) {
        updateProcessingState(status, progress, message, error);
      }
    },
    enhancedState
  );

  // Use our sheet selection hook
  const { handleSheetSelection: selectSheet } = useSheetSelection(workflowId, nodeId);
  
  // Use our file association utilities
  const { formatFileSize } = useFileAssociation();

  // Extract sheet metadata from the selected file with more robustness
  useEffect(() => {
    if (selectedFile?.file_metadata) {
      const metadata = selectedFile.file_metadata;
      
      let sheets: SheetMetadata[] = [];
      
      try {
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
          
          if (onChange && !fileSelectionInProgressRef.current) {
            onChange(nodeId, { 
              ...configRef.current,
              selectedSheet: defaultSheet.name
            });
          }
        }
      } catch (error) {
        console.error("Error processing sheet metadata:", error);
      }
    }
  }, [selectedFile, selectedSheet, nodeId, onChange]);

  // Update file info and processing state when the selected file changes
  // Only process updates when we actually have a file
  useEffect(() => {
    // Skip processing during file selection changes
    if (fileSelectionInProgressRef.current) return;
    
    if (selectedFile) {
      setFileInfo(selectedFile);
      
      const processingStatus = selectedFile.processing_status as string;
      
      if (processingStatus === WorkflowFileStatus.Completed) {
        updateProcessingState(UIFileProcessingState.Completed, 100);
      } else if (processingStatus === WorkflowFileStatus.Processing) {
        updateProcessingState(UIFileProcessingState.Processing, 50, 'Processing file data...');
      } else if (
        processingStatus === WorkflowFileStatus.Failed || 
        processingStatus === WorkflowFileStatus.Error
      ) {
        updateProcessingState(
          UIFileProcessingState.Error, 
          0, 
          'Error', 
          selectedFile.error_message || 'File processing failed'
        );
      }
    }
  }, [selectedFile, updateProcessingState]);

  const handleFileSelection = useCallback(async (fileId: string) => {
    if (!fileId || fileSelectionInProgressRef.current) return;
    
    try {
      // Skip if same file and already processed
      if (fileId === selectedFileId && fileInfo && fileInfo.processing_status === WorkflowFileStatus.Completed) {
        return;
      }
      
      // Set flags to prevent re-renders during selection
      fileSelectionInProgressRef.current = true;
      pendingFileIdRef.current = fileId;
      
      // Update state in sequence to reduce UI flicker
      setSelectedFileId(fileId);
      setSelectedSheet(undefined);
      
      // Only activate processing state after file selection
      updateProcessingState(UIFileProcessingState.Associating, 10, 'Associating file with workflow...');
      
      await processFile(fileId, onChange, files);
      
      // Clear selection flags - set a timeout to ensure state updates have propagated
      setTimeout(() => {
        fileSelectionInProgressRef.current = false;
        pendingFileIdRef.current = undefined;
      }, 250);
    } catch (error) {
      console.error('Error in file selection:', error);
      // Ensure flags are cleared even on error
      fileSelectionInProgressRef.current = false;
      pendingFileIdRef.current = undefined;
    }
  }, [selectedFileId, fileInfo, updateProcessingState, processFile, onChange, files]);

  const handleSheetSelection = useCallback(async (sheetName: string) => {
    if (fileSelectionInProgressRef.current) return;
    
    console.log(`Setting selected sheet to: ${sheetName}`);
    setSelectedSheet(sheetName);
    await selectSheet(sheetName, configRef.current, onChange);
  }, [selectSheet, onChange]);

  const handleRetry = useCallback(async () => {
    if (!selectedFileId || fileSelectionInProgressRef.current) return;
    
    fileSelectionInProgressRef.current = true;
    updateProcessingState(UIFileProcessingState.Associating, 10, 'Retrying file processing...');
    
    try {
      await processFile(selectedFileId, onChange, files);
    } finally {
      // Ensure flag is cleared
      setTimeout(() => {
        fileSelectionInProgressRef.current = false;
      }, 250);
    }
  }, [selectedFileId, updateProcessingState, processFile, onChange, files]);

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
    enhancedState,
    loadingIndicatorState,
    realtimeEnabled,
    fileInfo,
    refetch,
    formatFileSize,
    handleFileSelection,
    handleSheetSelection,
    handleRetry
  };
};
