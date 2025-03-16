
import React, { useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { useWorkflow } from '../../context/WorkflowContext';
import { useFileUploadNode } from './useFileUploadNode';
import FileSelector from './FileSelector';
import SheetSelector from './SheetSelector';
import FileProcessingStatus from './FileProcessingStatus';
import FileInfoDisplay from './FileInfoDisplay';
import FileUploadNodeHeader from './FileUploadNodeHeader';
import SyncButton from './SyncButton';
import WorkflowIdDisplay from './WorkflowIdDisplay';
import FileUploadHelpMessage from './FileUploadHelpMessage';

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
    if (selected) return 'border-primary shadow-[0_0_0_1px_hsl(var(--primary))]';
    
    if (enhancedState.isProcessing) {
      return 'border-blue-300 shadow-blue-100';
    } else if (enhancedState.isComplete) {
      return 'border-green-300 shadow-green-100';
    } else if (enhancedState.isError) {
      return 'border-red-300 shadow-red-100';
    }
    return 'border-gray-200 hover:border-gray-300';
  };

  // Get glow effect based on state
  const getGlowEffect = () => {
    if (!loadingIndicatorState.showGlow) return '';
    
    const color = loadingIndicatorState.glowColor;
    const animation = loadingIndicatorState.pulseAnimation ? 'animate-pulse' : '';
    
    if (color === 'green') return `shadow-lg shadow-green-100/60 ${animation}`;
    if (color === 'red') return `shadow-lg shadow-red-100/60 ${animation}`;
    if (color === 'amber') return `shadow-lg shadow-amber-100/60 ${animation}`;
    return `shadow-lg shadow-blue-100/60 ${animation}`;
  };

  return (
    <div 
      className={cn(
        "p-4 rounded-md border-2", 
        getBorderStyles(),
        getGlowEffect(),
        "bg-white w-72 transition-all duration-300 animate-fade-in backdrop-blur-sm",
        "hover:shadow-md"
      )}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        id="in" 
        className="w-3 h-3 bg-blue-500 border-2 border-white -top-1.5"
      />
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="out" 
        className="w-3 h-3 bg-green-500 border-2 border-white -bottom-1.5"
      />
      
      <FileUploadNodeHeader 
        label={data.label}
        isProcessing={enhancedState.isProcessing}
        isComplete={enhancedState.isComplete}
        isError={enhancedState.isError}
        realtimeEnabled={realtimeEnabled}
        refetch={refetch}
      />
      
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
        
        {!selectedFileId && !isLoadingFiles && <FileUploadHelpMessage />}
        
        {selectedFileId && enhancedState.isComplete && (
          <SyncButton onClick={handleForceSyncSchema} disabled={false} />
        )}
        
        <WorkflowIdDisplay workflowId={nodeWorkflowId} />
      </div>
    </div>
  );
};

export default FileUploadNode;
