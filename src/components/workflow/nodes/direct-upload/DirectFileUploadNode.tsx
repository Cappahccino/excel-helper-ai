
import React, { useCallback, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkflow } from '../../context/WorkflowContext';
import { useDirectFileUpload } from '@/hooks/useDirectFileUpload';
import { FileProcessingStatus } from '@/types/fileProcessing';
import FileProcessingStatus from '../file-upload/FileProcessingStatus';
import NodeProgress from '../../ui/NodeProgress';

interface DirectFileUploadNodeProps {
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

const DirectFileUploadNode: React.FC<DirectFileUploadNodeProps> = ({ id, selected, data }) => {
  const { workflowId, queueSchemaPropagation, propagateFileSchema, getEdges } = useWorkflow();
  const nodeWorkflowId = data.workflowId || workflowId;
  
  const handleFileUploaded = useCallback((fileId: string, filename: string) => {
    if (data.onChange) {
      data.onChange(id, {
        ...data.config,
        fileId,
        filename
      });
    }
  }, [data, id]);
  
  const {
    selectedFile,
    processingState,
    isDragActive,
    fileInputRef,
    isPending,
    isProcessing,
    isComplete,
    isError,
    handleDrop,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleFileChange,
    handleSelectClick,
    handleRetry,
    resetInput
  } = useDirectFileUpload({
    workflowId: nodeWorkflowId || null,
    nodeId: id,
    onFileUploaded: handleFileUploaded
  });
  
  // Propagate schema when file processing completes
  useEffect(() => {
    async function propagateSchemaToConnectedNodes() {
      if (!nodeWorkflowId || !data.config?.fileId || processingState.status !== 'completed') {
        return;
      }
      
      try {
        // Get the edges to find connected nodes
        const edges = await getEdges(nodeWorkflowId);
        const connectedNodes = edges
          .filter(edge => edge.source === id)
          .map(edge => edge.target);
          
        if (connectedNodes.length === 0) {
          return;
        }
        
        // Try to propagate schema to all connected nodes
        for (const targetNodeId of connectedNodes) {
          // Try direct propagation first
          const success = await propagateFileSchema(id, targetNodeId, data.config.selectedSheet);
          
          if (!success) {
            // Fall back to queued propagation
            queueSchemaPropagation(id, targetNodeId, data.config.selectedSheet);
          }
        }
      } catch (error) {
        console.error(`DirectFileUploadNode ${id}: Error propagating schema:`, error);
      }
    }
    
    propagateSchemaToConnectedNodes();
  }, [id, nodeWorkflowId, data.config?.fileId, data.config?.selectedSheet, processingState.status, propagateFileSchema, queueSchemaPropagation, getEdges]);

  // Force sync schema with connected nodes
  const handleForceSyncSchema = useCallback(async () => {
    if (!nodeWorkflowId || !data.config?.fileId || processingState.status !== 'completed') {
      return;
    }
    
    try {
      const edges = await getEdges(nodeWorkflowId);
      const connectedNodes = edges
        .filter(edge => edge.source === id)
        .map(edge => edge.target);
        
      if (connectedNodes.length === 0) {
        return;
      }
      
      for (const targetNodeId of connectedNodes) {
        await propagateFileSchema(id, targetNodeId, data.config.selectedSheet);
      }
    } catch (error) {
      console.error('Error syncing schema:', error);
    }
  }, [id, nodeWorkflowId, data.config?.fileId, data.config?.selectedSheet, processingState.status, propagateFileSchema, getEdges]);

  return (
    <div className={`p-4 rounded-md border-2 ${selected ? 'border-primary' : 'border-gray-200'} bg-white shadow-md w-72`}>
      <Handle type="target" position={Position.Top} id="in" />
      <Handle type="source" position={Position.Bottom} id="out" />
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-violet-100">
            <Upload className="h-4 w-4 text-violet-600" />
          </div>
          <h3 className="font-medium text-sm">{data.label || 'Direct File Upload'}</h3>
        </div>
      </div>
      
      <div className="space-y-3">
        {data.config?.fileId ? (
          <>
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium truncate max-w-[180px]">
                  {data.config.filename || 'File uploaded'}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={resetInput}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            
            <FileProcessingStatus
              status={processingState.status}
              progress={processingState.progress}
              message={processingState.message}
              error={processingState.error}
              onRetry={handleRetry}
            />
            
            {isComplete && (
              <Button 
                size="sm" 
                variant="outline" 
                className="w-full text-xs" 
                onClick={handleForceSyncSchema}
              >
                Sync Schema with Connected Nodes
              </Button>
            )}
          </>
        ) : (
          <>
            <div
              className={`border-2 border-dashed rounded-md p-5 transition-colors text-center cursor-pointer
                ${isDragActive 
                  ? 'border-violet-500 bg-violet-50' 
                  : 'border-gray-300 hover:border-violet-400 hover:bg-gray-50'}
                ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
              `}
              onDrop={handleDrop}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onClick={handleSelectClick}
            >
              <Upload className="h-10 w-10 mx-auto mb-2 text-gray-400" />
              <p className="text-sm font-medium mb-1">
                {isDragActive ? 'Drop your file here' : 'Drag & Drop Excel File'}
              </p>
              <p className="text-xs text-gray-500">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
                disabled={isProcessing}
              />
            </div>
            
            {selectedFile && (
              <div className="bg-gray-50 p-2 rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="text-sm truncate max-w-[180px]">
                      {selectedFile.name}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {(selectedFile.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                
                {isProcessing && (
                  <NodeProgress 
                    value={processingState.progress || 0}
                    status="info"
                    showLabel={true}
                    processingStatus={processingState.message}
                    animated={true}
                  />
                )}
              </div>
            )}
            
            {isError && (
              <FileProcessingStatus
                status={processingState.status as FileProcessingStatus}
                progress={processingState.progress}
                message={processingState.message}
                error={processingState.error}
                onRetry={handleRetry}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DirectFileUploadNode;
