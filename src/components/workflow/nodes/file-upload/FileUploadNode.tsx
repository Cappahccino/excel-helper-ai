import React, { useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileProcessingState } from '@/types/workflowStatus';
import { useFileUploadNode } from './useFileUploadNode';
import { useWorkflow } from '../../context/WorkflowContext';
import FileSelector from './FileSelector';
import SheetSelector from './SheetSelector';
import FileProcessingStatus from './FileProcessingStatus';
import FileInfoDisplay from './FileInfoDisplay';
import { toast } from 'sonner';

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
    handleRetry
  } = useFileUploadNode(nodeWorkflowId || null, id, data.config, data.onChange);

  // Propagate schema when sheet changes or when file processing completes
  useEffect(() => {
    async function propagateSchemaToConnectedNodes() {
      if (!nodeWorkflowId || !selectedFileId) {
        console.log(`FileUploadNode ${id}: Cannot propagate schema - missing workflowId or fileId`);
        return;
      }

      try {
        // Only propagate if processing is complete and we have a valid sheet
        if (processingState.status !== 'completed' || !selectedSheet) {
          console.log(`FileUploadNode ${id}: Not ready to propagate schema - status: ${processingState.status}, sheet: ${selectedSheet}`);
          return;
        }

        // Get connected nodes
        const edges = await getEdges(nodeWorkflowId);
        const connectedNodes = edges
          .filter(edge => edge.source === id)
          .map(edge => edge.target);

        if (connectedNodes.length === 0) {
          console.log(`FileUploadNode ${id}: No connected nodes to propagate schema to`);
          return;
        }

        // Check if node is ready for propagation
        const isReady = await isNodeReadyForPropagation(id);
        if (!isReady) {
          console.log(`FileUploadNode ${id}: Not ready for schema propagation`);
          return;
        }

        // Add a small delay to ensure all metadata is saved
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try to propagate schema to all connected nodes
        for (const targetNodeId of connectedNodes) {
          console.log(`FileUploadNode ${id}: Propagating schema to node ${targetNodeId} with sheet ${selectedSheet}`);
          
          try {
            // First synchronize sheet selection
            const syncSuccess = await workflow.syncSheetSelection?.(id, targetNodeId);
            if (!syncSuccess) {
              console.warn(`FileUploadNode ${id}: Failed to sync sheet selection with ${targetNodeId}`);
            }

            // Use direct propagation with retries
            let propagationSuccess = false;
            for (let attempt = 0; attempt < 3 && !propagationSuccess; attempt++) {
              if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              propagationSuccess = await propagateFileSchema(id, targetNodeId, selectedSheet);
            }

            if (propagationSuccess) {
              console.log(`FileUploadNode ${id}: Successfully propagated schema to ${targetNodeId}`);
            } else {
              console.log(`FileUploadNode ${id}: Failed direct propagation after retries, queueing schema propagation to node ${targetNodeId}`);
              queueSchemaPropagation(id, targetNodeId, selectedSheet);
            }
          } catch (error) {
            console.error(`FileUploadNode ${id}: Error propagating schema to ${targetNodeId}:`, error);
            queueSchemaPropagation(id, targetNodeId, selectedSheet);
          }
        }
      } catch (error) {
        console.error(`FileUploadNode ${id}: Error propagating schema to connected nodes:`, error);
      }
    }

    propagateSchemaToConnectedNodes();
  }, [id, nodeWorkflowId, selectedSheet, selectedFileId, processingState.status, queueSchemaPropagation, getEdges, isNodeReadyForPropagation, propagateFileSchema, availableSheets]);

  // Manual sync button handler
  const handleForceSyncSchema = async () => {
    if (!nodeWorkflowId || !selectedFileId || processingState.status !== FileProcessingState.Completed) {
      toast.error("Cannot sync schema - file not ready");
      return;
    }

    try {
      toast.info("Syncing schema to connected nodes...");
      
      const edges = await getEdges(nodeWorkflowId);
      const connectedNodes = edges
        .filter(edge => edge.source === id)
        .map(edge => edge.target);
      
      if (connectedNodes.length === 0) {
        toast.warning("No connected nodes to sync schema with");
        return;
      }
      
      console.log(`Manually syncing schema to ${connectedNodes.length} connected nodes`);
      
      let successCount = 0;
      for (const targetNodeId of connectedNodes) {
        const success = await propagateFileSchema(id, targetNodeId, selectedSheet);
        if (success) successCount++;
      }
      
      if (successCount > 0) {
        toast.success(`Schema synced to ${successCount} node${successCount !== 1 ? 's' : ''}`);
      } else {
        toast.error("Failed to sync schema to any nodes");
      }
    } catch (error) {
      console.error("Error syncing schema:", error);
      toast.error("Error syncing schema: " + (error as Error).message);
    }
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
            <div className="h-5 mr-1 bg-green-50 text-green-700 border border-green-200 text-[9px] py-0.5 px-1.5 rounded-md">
              live
            </div>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 w-6 p-0" 
            onClick={() => refetch()}
            disabled={processingState.status !== FileProcessingState.Pending && 
                      processingState.status !== FileProcessingState.Completed && 
                      processingState.status !== FileProcessingState.Error}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
      
      <div className="space-y-3">
        <FileSelector
          selectedFileId={selectedFileId}
          files={files || []}
          isLoadingFiles={isLoadingFiles}
          onFileSelect={handleFileSelection}
          disabled={processingState.status !== FileProcessingState.Pending && 
                   processingState.status !== FileProcessingState.Completed && 
                   processingState.status !== FileProcessingState.Error}
        />
        
        {selectedFileId && processingState.status === FileProcessingState.Completed && availableSheets.length > 0 && (
          <SheetSelector
            selectedSheet={selectedSheet}
            availableSheets={availableSheets}
            onSheetSelect={handleSheetSelection}
            isLoading={isLoadingSheetSchema}
          />
        )}
        
        <FileProcessingStatus
          status={processingState.status}
          progress={processingState.progress}
          message={processingState.message}
          error={processingState.error}
          onRetry={handleRetry}
        />
        
        <FileInfoDisplay
          fileInfo={fileInfo}
          selectedFileId={selectedFileId}
          processingState={processingState}
          isLoadingSelectedFile={isLoadingSelectedFile}
          selectedSheet={selectedSheet}
          availableSheets={availableSheets}
          isLoadingSchema={isLoadingSchema}
          isLoadingSheetSchema={isLoadingSheetSchema}
          sheetSchema={sheetSchema}
          formatFileSize={formatFileSize}
        />
        
        {!selectedFileId && !isLoadingFiles && (
          <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-700 border border-blue-100">
            <p>Select a file to use in this workflow. You can upload files in the Files section.</p>
          </div>
        )}
        
        {selectedFileId && processingState.status === FileProcessingState.Completed && (
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
