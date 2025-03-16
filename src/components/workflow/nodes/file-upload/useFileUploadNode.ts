
import { useState, useCallback, useEffect, useMemo } from 'react';
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
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>(config?.fileId);
  const [selectedSheet, setSelectedSheet] = useState<string | undefined>(config?.selectedSheet);
  const [availableSheets, setAvailableSheets] = useState<SheetMetadata[]>([]);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [fileInfo, setFileInfo] = useState<any>(null);
  
  // Initialize the file processing state
  const { 
    processingState, 
    updateProcessingState, 
    enhancedState, 
    loadingIndicatorState 
  } = useFileProcessingState({
    status: 'pending',
    progress: 0
  });

  // Use our queries hook to fetch data
  const {
    files,
    isLoadingFiles,
    refetch,
    selectedFile,
    isLoadingSelectedFile,
    sheetSchema,
    isLoadingSheetSchema
  } = useFileQueries(workflowId, nodeId, selectedFileId, selectedSheet);

  // Use our realtime hook for live updates
  const { realtimeEnabled } = useFileRealtime(
    workflowId, 
    nodeId, 
    selectedFileId, 
    updateProcessingState, 
    refetch
  );

  // Use our file processing hook
  const { processFile } = useFileProcessing(
    workflowId, 
    nodeId, 
    updateProcessingState,
    enhancedState
  );

  // Use our sheet selection hook
  const { handleSheetSelection: selectSheet } = useSheetSelection(workflowId, nodeId);
  
  // Use our file association utilities
  const { formatFileSize } = useFileAssociation();

  // Extract sheet metadata from the selected file
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

  // Update file info and processing state when the selected file changes
  useEffect(() => {
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

  const handleFileSelection = async (fileId: string) => {
    if (!fileId) return;
    
    try {
      if (fileId === selectedFileId && fileInfo && fileInfo.processing_status === WorkflowFileStatus.Completed) {
        return;
      }
      
      updateProcessingState(UIFileProcessingState.Associating, 10, 'Associating file with workflow...');
      setSelectedFileId(fileId);
      setSelectedSheet(undefined);
      
      await processFile(fileId, onChange, files);
    } catch (error) {
      console.error('Error in file selection:', error);
    }
  };

  const handleSheetSelection = useCallback(async (sheetName: string) => {
    console.log(`Setting selected sheet to: ${sheetName}`);
    setSelectedSheet(sheetName);
    await selectSheet(sheetName, config, onChange);
  }, [config, onChange, selectSheet]);

  const handleRetry = useCallback(async () => {
    if (!selectedFileId) return;
    updateProcessingState(UIFileProcessingState.Associating, 10, 'Retrying file processing...');
    await handleFileSelection(selectedFileId);
  }, [selectedFileId, workflowId, nodeId]);

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
