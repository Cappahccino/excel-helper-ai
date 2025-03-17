
import React, { useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, RefreshCw, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileProcessingState } from '@/types/workflowStatus';
import { useFileUploadNode } from './useFileUploadNode';
import { useWorkflow } from '../../context/WorkflowContext';
import { useSchemaConnection } from '@/hooks/useSchemaConnection';
import FileSelector from './FileSelector';
import SheetSelector from './SheetSelector';
import FileProcessingStatus from './FileProcessingStatus';
import FileInfoDisplay from './FileInfoDisplay';
import WorkflowLogDialog from '@/components/workflow/WorkflowLogDialog';

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
  const { workflowId } = useWorkflow();
  
  const nodeWorkflowId = data.workflowId || workflowId;
  
  const {
    selectedFileId,
    selectedSheet,
    availableSheets,
    files,
    isLoadingFiles,
    isLoadingSelectedFile,
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

  // Use the schema connection hook as a source node
  const {
    targetNodes,
    setSelectedSheet: setSchemaSelectedSheet,
    propagateSchema
  } = useSchemaConnection(id, true);
  
  const [showLogDialog, setShowLogDialog] = React.useState(false);

  // Propagate schema when sheet changes or when file processing completes
  useEffect(() => {
    if (!nodeWorkflowId || !selectedFileId) return;
    
    // Don't try to propagate if file is not fully processed
    if (processingState.status !== FileProcessingState.Completed) {
      console.log(`FileUploadNode ${id}: Not ready for schema propagation yet - file processing status: ${processingState.status}`);
      return;
    }
    
    // Don't try to propagate if no sheet is selected but sheets are available
    if (!selectedSheet && availableSheets.length > 0) {
      console.log(`FileUploadNode ${id}: Sheet not selected yet, but sheets are available`);
      return;
    }
    
    // Set the selected sheet in the schema connection hook
    setSchemaSelectedSheet(selectedSheet || null);
    
    // Propagate schema to target nodes
    if (targetNodes.length > 0) {
      console.log(`FileUploadNode ${id}: Propagating schema with sheet ${selectedSheet || 'default'} to ${targetNodes.length} nodes`);
      propagateSchema();
    }
  }, [
    id, 
    nodeWorkflowId, 
    selectedSheet, 
    selectedFileId, 
    processingState.status, 
    availableSheets, 
    targetNodes, 
    setSchemaSelectedSheet,
    propagateSchema
  ]);

  // Manual sync button handler
  const handleForceSyncSchema = async () => {
    if (!nodeWorkflowId || !selectedFileId || processingState.status !== FileProcessingState.Completed) {
      console.log("Cannot sync schema - file not ready");
      return;
    }
    
    try {
      console.log(`Manually syncing schema to target nodes`);
      await propagateSchema();
    } catch (error) {
      console.error("Error syncing schema:", error);
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
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setShowLogDialog(true)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
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
            isLoading={false}
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
          isLoadingSchema={false}
          isLoadingSheetSchema={false}
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
      
      {showLogDialog && (
        <WorkflowLogDialog
          selectedNodeId={id}
          isOpen={showLogDialog}
          onOpenChange={setShowLogDialog}
        />
      )}
    </div>
  );
};

export default FileUploadNode;
