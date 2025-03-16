import React, { useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileUploadNodeState } from '@/hooks/useFileUploadNodeState';
import { FileProcessingStates } from '@/types/fileProcessing';
import { useWorkflow } from '../../context/WorkflowContext';
import FileSelector from './FileSelector';
import SheetSelector from './SheetSelector';
import FileProcessingStatus from './FileProcessingStatus';
import FileInfoDisplay from './FileInfoDisplay';

interface FileUploadNodeProps {
  id: string;
  selected: boolean;
  data: {
    label: string;
    config?: {
      fileId?: string;
      filename?: string;
      hasHeaders?: boolean;
      delimiter?: string;
      selectedSheet?: string;
    };
    onChange?: (nodeId: string, config: any) => void;
    workflowId?: string;
  };
}

const FileUploadNode: React.FC<FileUploadNodeProps> = ({ id, selected, data }) => {
  const { 
    workflowId, 
    queueSchemaPropagation,
    propagateFileSchema,
    getEdges, 
    isNodeReadyForPropagation 
  } = useWorkflow();
  
  const nodeWorkflowId = data.workflowId || workflowId;
  
  const {
    fileState,
    processingState,
    schema,
    metadata,
    uploadFile,
    removeFile,
    updateSelectedSheet,
    isProcessing,
    isComplete
  } = useFileUploadNodeState({
    workflowId: nodeWorkflowId,
    nodeId: id
  });

  // Update onChange handler when file state changes
  useEffect(() => {
    if (data.onChange && fileState.fileId) {
      data.onChange(id, {
        fileId: fileState.fileId,
        filename: fileState.fileName,
        selectedSheet: metadata?.selected_sheet
      });
    }
  }, [id, fileState.fileId, fileState.fileName, metadata, data.onChange]);

  // Propagate schema when sheet changes or when file processing completes
  useEffect(() => {
    async function propagateSchemaToConnectedNodes() {
      if (!nodeWorkflowId || !fileState.fileId) {
        return;
      }

      // Check if this node is not ready for propagation yet
      if (!isComplete) {
        console.log(`FileUploadNode ${id}: Not ready for schema propagation yet - file processing status: ${processingState.status}`);
        return;
      }

      if (!metadata?.selected_sheet && schema?.sheetName) {
        console.log(`FileUploadNode ${id}: Using schema sheet name: ${schema.sheetName}`);
      }

      try {
        console.log(`FileUploadNode ${id}: Checking readiness for schema propagation`);
        
        // Get the edges to find connected nodes
        const edges = await getEdges(nodeWorkflowId);
        const connectedNodes = edges
          .filter(edge => edge.source === id)
          .map(edge => edge.target);

        if (connectedNodes.length === 0) {
          console.log(`FileUploadNode ${id}: No connected nodes found to propagate schema to`);
          return;
        }

        console.log(`FileUploadNode ${id}: Found ${connectedNodes.length} connected nodes to propagate schema to`);
        
        // Force check readiness
        const isReady = await isNodeReadyForPropagation(id);
        
        if (!isReady) {
          console.log(`FileUploadNode ${id}: Not ready for schema propagation yet per readiness check`);
          return;
        }
        
        const selectedSheet = metadata?.selected_sheet || schema?.sheetName;
        console.log(`FileUploadNode ${id}: Ready to propagate schema with sheet ${selectedSheet || 'default'} to connected nodes`);
        
        // Try to propagate schema to all connected nodes
        for (const targetNodeId of connectedNodes) {
          console.log(`FileUploadNode ${id}: Directly propagating schema to node ${targetNodeId} with sheet ${selectedSheet || 'Sheet1'}`);
          
          // Use direct propagation first for immediate update
          const success = await propagateFileSchema(id, targetNodeId, selectedSheet);
          
          if (success) {
            console.log(`FileUploadNode ${id}: Successfully propagated schema to ${targetNodeId}`);
          } else {
            console.log(`FileUploadNode ${id}: Failed direct propagation, queueing schema propagation to node ${targetNodeId}`);
            // Fall back to queued propagation if direct fails
            queueSchemaPropagation(id, targetNodeId, selectedSheet);
          }
        }
      } catch (error) {
        console.error(`FileUploadNode ${id}: Error propagating schema to connected nodes:`, error);
      }
    }

    propagateSchemaToConnectedNodes();
  }, [id, nodeWorkflowId, metadata?.selected_sheet, fileState.fileId, isComplete, processingState.status, queueSchemaPropagation, getEdges, isNodeReadyForPropagation, propagateFileSchema, schema]);

  // Handler for file selection
  const handleFileSelection = async (fileId: string) => {
    if (processingState.status === FileProcessingStates.COMPLETED && fileState.fileId === fileId) {
      console.log('File already selected and processed');
      return;
    }
    
    await uploadFile(await fetchFileObject(fileId));
  };
  
  // Helper to fetch file object from ID - placeholder since we don't upload directly
  const fetchFileObject = async (fileId: string): Promise<File> => {
    // This is a mock function - in a real implementation you'd fetch the file
    // from storage or create a placeholder File object
    return new File([""], "placeholder.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  };

  // Handler for sheet selection
  const handleSheetSelection = async (sheetName: string) => {
    if (!fileState.fileId) return;
    await updateSelectedSheet(sheetName);
  };

  // Manual sync button handler
  const handleForceSyncSchema = async () => {
    if (!nodeWorkflowId || !fileState.fileId || !isComplete) {
      console.log("Cannot sync schema - file not ready");
      return;
    }

    try {
      const edges = await getEdges(nodeWorkflowId);
      const connectedNodes = edges
        .filter(edge => edge.source === id)
        .map(edge => edge.target);
      
      if (connectedNodes.length === 0) {
        console.log("No connected nodes to sync schema with");
        return;
      }
      
      console.log(`Manually syncing schema to ${connectedNodes.length} connected nodes`);
      
      for (const targetNodeId of connectedNodes) {
        await propagateFileSchema(id, targetNodeId, metadata?.selected_sheet || schema?.sheetName);
      }
    } catch (error) {
      console.error("Error syncing schema:", error);
    }
  };

  // Get available sheets from schema or metadata
  const getAvailableSheets = () => {
    // If the file metadata has sheets_metadata, use that
    if (metadata?.sheets_metadata && Array.isArray(metadata.sheets_metadata)) {
      return metadata.sheets_metadata;
    }
    
    // Otherwise return an empty array
    return [];
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
      </div>
      
      <div className="space-y-3">
        <FileSelector
          selectedFileId={fileState.fileId}
          files={[]} // This would be populated from a query
          isLoadingFiles={false}
          onFileSelect={handleFileSelection}
          disabled={isProcessing}
        />
        
        {fileState.fileId && isComplete && getAvailableSheets().length > 0 && (
          <SheetSelector
            selectedSheet={metadata?.selected_sheet || schema?.sheetName}
            availableSheets={getAvailableSheets()}
            onSheetSelect={handleSheetSelection}
            isLoading={false}
          />
        )}
        
        <FileProcessingStatus
          status={processingState.status}
          progress={processingState.progress}
          message={processingState.message}
          error={processingState.error}
          onRetry={() => handleFileSelection(fileState.fileId || '')}
        />
        
        <FileInfoDisplay
          fileInfo={{
            id: fileState.fileId,
            filename: fileState.fileName,
            processing_status: processingState.status
          }}
          selectedFileId={fileState.fileId}
          processingState={processingState}
          isLoadingSelectedFile={false}
          selectedSheet={metadata?.selected_sheet || schema?.sheetName}
          availableSheets={getAvailableSheets()}
          isLoadingSchema={false}
          isLoadingSheetSchema={false}
          sheetSchema={schema}
          formatFileSize={(size) => `${(size / 1024).toFixed(1)} KB`}
        />
        
        {!fileState.fileId && (
          <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-700 border border-blue-100">
            <p>Select a file to use in this workflow. You can upload files in the Files section.</p>
          </div>
        )}
        
        {fileState.fileId && isComplete && (
          <Button 
            size="sm" 
            variant="outline" 
            className="w-full text-xs mt-2" 
            onClick={handleForceSyncSchema}
          >
            Sync Schema with Connected Nodes
          </Button>
        )}
        
        {nodeWorkflowId && (
          <div className="mt-2 text-[10px] text-gray-400 overflow-hidden text-ellipsis">
            {nodeWorkflowId.startsWith('temp-') ? 'Temporary workflow: ' : 'Workflow: '}
            {nodeWorkflowId.length > 20 ? `${nodeWorkflowId.substring(0, 20)}...` : nodeWorkflowId}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploadNode;
