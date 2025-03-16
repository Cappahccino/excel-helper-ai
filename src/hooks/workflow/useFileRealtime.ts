
import { useState, useEffect } from 'react';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { WorkflowFileStatus } from '@/types/workflowStatus';
import { FileProcessingState as UIFileProcessingState } from '@/types/workflowStatus';

export const useFileRealtime = (
  workflowId: string | null, 
  nodeId: string, 
  selectedFileId: string | undefined,
  updateProcessingState: (status: any, progress?: number, message?: string, error?: string) => void,
  refetch: () => void
) => {
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);

  useEffect(() => {
    if (!workflowId || !selectedFileId || !nodeId) return;
    
    console.log('Setting up realtime subscription for workflow file updates');
    const dbWorkflowId = convertToDbWorkflowId(workflowId);
    
    const channel = supabase
      .channel(`workflow_file_updates_${nodeId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workflow_files',
          filter: `workflow_id=eq.${dbWorkflowId} AND node_id=eq.${nodeId} AND file_id=eq.${selectedFileId}`
        },
        (payload) => {
          console.log('Received realtime update for workflow file:', payload);
          const updatedFile = payload.new;
          
          const processingStatus = updatedFile.processing_status as string;
          
          if (processingStatus === WorkflowFileStatus.Completed) {
            updateProcessingState(UIFileProcessingState.Completed, 100, 'File processed successfully');
            refetch();
          } else if (processingStatus === WorkflowFileStatus.Processing) {
            updateProcessingState(UIFileProcessingState.Processing, 50, 'Processing file data...');
          } else if (processingStatus === WorkflowFileStatus.Failed || 
                     processingStatus === WorkflowFileStatus.Error) {
            const errorMessage = updatedFile.processing_error || 'File processing failed';
            updateProcessingState(UIFileProcessingState.Error, 0, 'Error', errorMessage);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to workflow file updates');
          setRealtimeEnabled(true);
        } else {
          console.error('Failed to subscribe to workflow file updates:', status);
          setRealtimeEnabled(false);
        }
      });
    
    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [workflowId, selectedFileId, nodeId, updateProcessingState, refetch]);

  return {
    realtimeEnabled
  };
};
