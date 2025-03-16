
import React, { useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileUploadNode } from './useFileUploadNode';
import { useWorkflow } from '../../context/WorkflowContext';
import FileSelector from './FileSelector';
import SheetSelector from './SheetSelector';
import FileProcessingStatus from './FileProcessingStatus';
import FileInfoDisplay from './FileInfoDisplay';
import { cn } from '@/lib/utils';

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
    enhancedState,
    loadingIndicatorState,
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
        return;
      }

      // Check if this node is not ready for propagation yet
      if (!enhancedState.isComplete) {
        console.log(`FileUploadNode ${id}: Not ready for schema propagation yet - file processing status: ${enhancedState.status}`);
        return;
      }

      if (!selectedSheet && availableSheets.length > 0) {
        console.log(`FileUploadNode ${id}: Sheet not selected yet, but sheets are available`);
        return;
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
  }, [id, nodeWorkflowId, selectedSheet, selectedFileId, enhancedState.status, enhancedState.isComplete, queueSchemaPropagation, getEdges, isNodeReadyForPropagation, propagateFileSchema, availableSheets]);

  // Manual sync button handler
  const handleForceSyncSchema = async () => {
    if (!nodeWorkflowId || !selectedFileId || !enhancedState.isComplete) {
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
        await propagateFileSchema(id, targetNodeId, selectedSheet);
      }
    } catch (error) {
      console.error("Error syncing schema:", error);
    }
  };

  // Get border and shadow styles based on processing state
  const getBorderStyles = () => {
    if (selected) return 'border-primary';
    
    if (enhancedState.isProcessing) {
      return 'border-blue-300';
    } else if (enhancedState.isComplete) {
      return 'border-green-300';
    } else if (enhancedState.isError) {
      return 'border-red-300';
    }
    return 'border-gray-200';
  };

  // Get glow effect based on state
  const getGlowEffect = () => {
    if (!loadingIndicatorState.showGlow) return '';
    
    const color = loadingIndicatorState.glowColor;
    const animation = loadingIndicatorState.pulseAnimation ? 'animate-pulse' : '';
    
    if (color === 'green') return `shadow-lg shadow-green-100 ${animation}`;
    if (color === 'red') return `shadow-lg shadow-red-100 ${animation}`;
    if (color === 'amber') return `shadow-lg shadow-amber-100 ${animation}`;
    return `shadow-lg shadow-blue-100 ${animation}`;
  };

  return (
    <div className={cn(
      "p-4 rounded-md border-2", 
      getBorderStyles(),
      getGlowEffect(),
      "bg-white w-72 transition-all duration-200"
    )}>
      <Handle type="target" position={Position.Top} id="in" />
      <Handle type="source" position={Position.Bottom} id="out" />
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-1.5 rounded-md", 
            enhancedState.isProcessing ? "bg-blue-100" : 
            enhancedState.isComplete ? "bg-green-100" : 
            enhancedState.isError ? "bg-red-100" : "bg-blue-100"
          )}>
            <FileText className={cn(
              "h-4 w-4", 
              enhancedState.isProcessing ? "text-blue-600" : 
              enhancedState.isComplete ? "text-green-600" : 
              enhancedState.isError ? "text-red-600" : "text-blue-600"
            )} />
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
            className={cn(
              "h-6 w-6 p-0",
              enhancedState.isProcessing && "text-blue-500"
            )}
            onClick={() => refetch()}
            disabled={enhancedState.isProcessing}
          >
            <RefreshCw className={cn(
              "h-3.5 w-3.5", 
              isLoadingFiles || enhancedState.isProcessing ? "animate-spin" : ""
            )} />
          </Button>
        </div>
      </div>
      
      <div className="space-y-3">
        <FileSelector
          selectedFileId={selectedFileId}
          files={files || []}
          isLoadingFiles={isLoadingFiles}
          onFileSelect={handleFileSelection}
          disabled={enhancedState.isProcessing}
        />
        
        {selectedFileId && enhancedState.isComplete && availableSheets.length > 0 && (
          <SheetSelector
            selectedSheet={selectedSheet}
            availableSheets={availableSheets}
            onSheetSelect={handleSheetSelection}
            isLoading={isLoadingSheetSchema}
          />
        )}
        
        <FileProcessingStatus
          state={enhancedState}
          loadingState={loadingIndicatorState}
          onRetry={handleRetry}
        />
        
        <FileInfoDisplay
          fileInfo={fileInfo}
          selectedFileId={selectedFileId}
          processingState={enhancedState}
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
        
        {selectedFileId && enhancedState.isComplete && (
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
