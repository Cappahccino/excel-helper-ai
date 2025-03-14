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
  const { workflowId, propagateFileSchema, getEdges } = useWorkflow();
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

  useEffect(() => {
    async function propagateSchemaToConnectedNodes() {
      if (!workflowId || !selectedSheet || !selectedFileId || processingState.status !== FileProcessingState.Completed) {
        return;
      }

      try {
        console.log(`FileUploadNode ${id}: Propagating schema with sheet ${selectedSheet} to connected nodes`);
        
        const edges = await getEdges(workflowId);
        const connectedNodes = edges
          .filter(edge => edge.source === id)
          .map(edge => edge.target);

        if (connectedNodes.length === 0) {
          console.log(`FileUploadNode ${id}: No connected nodes found to propagate schema to`);
          return;
        }

        console.log(`FileUploadNode ${id}: Found ${connectedNodes.length} connected nodes to propagate schema to`);
        
        for (const targetNodeId of connectedNodes) {
          console.log(`FileUploadNode ${id}: Propagating schema to node ${targetNodeId} with sheet ${selectedSheet}`);
          
          try {
            let success = false;
            let attempts = 0;
            const maxAttempts = 3;
            
            while (!success && attempts < maxAttempts) {
              attempts++;
              try {
                success = await propagateFileSchema(id, targetNodeId, selectedSheet);
                if (success) {
                  console.log(`FileUploadNode ${id}: Schema propagation to ${targetNodeId} succeeded on attempt ${attempts}`);
                  break;
                } else {
                  console.log(`FileUploadNode ${id}: Schema propagation to ${targetNodeId} failed on attempt ${attempts}, retrying...`);
                  await new Promise(resolve => setTimeout(resolve, 500 * attempts));
                }
              } catch (attemptError) {
                console.error(`Error on propagation attempt ${attempts}:`, attemptError);
                if (attempts >= maxAttempts) throw attemptError;
                await new Promise(resolve => setTimeout(resolve, 500 * attempts));
              }
            }
            
            if (!success) {
              console.error(`FileUploadNode ${id}: Failed to propagate schema to ${targetNodeId} after ${maxAttempts} attempts`);
            }
          } catch (propagationError) {
            console.error(`Error propagating schema to node ${targetNodeId}:`, propagationError);
          }
        }
      } catch (error) {
        console.error(`FileUploadNode ${id}: Error propagating schema to connected nodes:`, error);
      }
    }

    propagateSchemaToConnectedNodes();
  }, [id, workflowId, selectedSheet, selectedFileId, processingState.status, propagateFileSchema, getEdges]);

  useEffect(() => {
    if (!workflowId) return;
    
    const handleEdgeChanges = async () => {
      if (!selectedSheet || !selectedFileId || processingState.status !== FileProcessingState.Completed) return;
      
      try {
        const edges = await getEdges(workflowId);
        const connectedNodes = edges
          .filter(edge => edge.source === id)
          .map(edge => edge.target);
          
        for (const targetNodeId of connectedNodes) {
          await propagateFileSchema(id, targetNodeId, selectedSheet);
        }
      } catch (error) {
        console.error(`Error handling edge changes:`, error);
      }
    };
    
    return () => {
    };
  }, [id, workflowId, selectedSheet, selectedFileId, processingState.status, propagateFileSchema, getEdges]);

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
