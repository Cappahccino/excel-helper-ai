
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNodeStatus } from '@/hooks/useNodeStatus';
import { useWorkflow } from '../../context/WorkflowContext';
import FileSelector from './FileSelector';
import SheetSelector from './SheetSelector';
import FileInfoDisplay from './FileInfoDisplay';
import NodeStatusWrapper from '../../ui/NodeStatusWrapper';
import { useFileUploadNode } from './useFileUploadNode';

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

const EnhancedFileUploadNode: React.FC<FileUploadNodeProps> = ({ id, selected, data }) => {
  const { 
    workflowId, 
    queueSchemaPropagation,
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

  const { 
    nodeStatus, 
    updateNodeStatus 
  } = useNodeStatus({
    workflowId: nodeWorkflowId,
    nodeId: id,
    tableName: 'workflow_files'
  });

  // Map our processingState to nodeStatus for visual feedback
  React.useEffect(() => {
    if (processingState.status === 'pending') {
      updateNodeStatus('idle');
    } else if (['uploading', 'associating', 'processing', 'fetching_schema', 'verifying'].includes(processingState.status)) {
      updateNodeStatus('processing', processingState.progress, processingState.message);
    } else if (processingState.status === 'completed') {
      updateNodeStatus('success', 100, 'File ready');
    } else if (['error', 'failed'].includes(processingState.status)) {
      updateNodeStatus('error', 0, undefined, processingState.error);
    }
  }, [processingState, updateNodeStatus]);

  // Propagate schema when sheet changes or when file processing completes
  React.useEffect(() => {
    async function propagateSchemaToConnectedNodes() {
      if (!nodeWorkflowId || !selectedFileId) {
        return;
      }

      // Check if this node is not ready for propagation yet
      if (processingState.status !== 'completed') {
        console.log(`FileUploadNode ${id}: Not ready for schema propagation yet - file processing status: ${processingState.status}`);
        return;
      }

      if (!selectedSheet && availableSheets.length > 0) {
        console.log(`FileUploadNode ${id}: Sheet not selected yet, but sheets are available`);
        return;
      }

      try {
        // Get the edges to find connected nodes
        const edges = await getEdges(nodeWorkflowId);
        const connectedNodes = edges
          .filter(edge => edge.source === id)
          .map(edge => edge.target);

        if (connectedNodes.length === 0) {
          console.log(`FileUploadNode ${id}: No connected nodes found to propagate schema to`);
          return;
        }
        
        // Force check readiness
        const isReady = await isNodeReadyForPropagation(id);
        
        if (!isReady) {
          console.log(`FileUploadNode ${id}: Not ready for schema propagation yet per readiness check`);
          return;
        }
        
        // Queue schema propagation to all connected nodes
        for (const targetNodeId of connectedNodes) {
          console.log(`FileUploadNode ${id}: Queueing schema propagation to node ${targetNodeId}`);
          queueSchemaPropagation(id, targetNodeId, selectedSheet);
        }
      } catch (error) {
        console.error(`FileUploadNode ${id}: Error propagating schema to connected nodes:`, error);
      }
    }

    propagateSchemaToConnectedNodes();
  }, [id, nodeWorkflowId, selectedSheet, selectedFileId, processingState.status, queueSchemaPropagation, getEdges, isNodeReadyForPropagation, availableSheets]);

  // Manual sync button handler
  const handleForceSyncSchema = async () => {
    if (!nodeWorkflowId || !selectedFileId || processingState.status !== 'completed') {
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
      
      for (const targetNodeId of connectedNodes) {
        queueSchemaPropagation(id, targetNodeId, selectedSheet);
      }
    } catch (error) {
      console.error("Error syncing schema:", error);
    }
  };

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} id="in" />
      <Handle type="source" position={Position.Bottom} id="out" />
      
      <NodeStatusWrapper
        status={nodeStatus.status}
        selected={selected}
        progress={nodeStatus.progress}
        errorMessage={nodeStatus.error}
        statusText={processingState.message}
        showProgressBar={processingState.status !== 'pending' && 
                         processingState.status !== 'completed' && 
                         processingState.status !== 'error' && 
                         processingState.status !== 'failed'}
        className="w-72"
      >
        <div className="p-4">
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
                disabled={processingState.status !== 'pending' && 
                          processingState.status !== 'completed' && 
                          processingState.status !== 'error'}
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
              disabled={processingState.status !== 'pending' && 
                       processingState.status !== 'completed' && 
                       processingState.status !== 'error'}
            />
            
            {selectedFileId && processingState.status === 'completed' && availableSheets.length > 0 && (
              <SheetSelector
                selectedSheet={selectedSheet}
                availableSheets={availableSheets}
                onSheetSelect={handleSheetSelection}
                isLoading={isLoadingSheetSchema}
              />
            )}
            
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
            
            {selectedFileId && processingState.status === 'completed' && (
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
      </NodeStatusWrapper>
    </div>
  );
};

export default EnhancedFileUploadNode;
