
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileProcessingStatus } from '@/types/fileProcessing';

export type NodeStatus = 
  | 'idle'
  | 'loading'
  | 'processing'
  | 'success'
  | 'error';

export interface NodeStatusState {
  status: NodeStatus;
  progress: number;
  message?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface UseNodeStatusOptions {
  workflowId?: string | null;
  nodeId: string;
  tableName?: string;
  pollingInterval?: number;
  initialState?: Partial<NodeStatusState>;
}

const DEFAULT_STATUS_STATE: NodeStatusState = {
  status: 'idle',
  progress: 0,
};

export function useNodeStatus({
  workflowId,
  nodeId,
  tableName = 'workflow_files',
  pollingInterval = 2000,
  initialState = {},
}: UseNodeStatusOptions) {
  const [nodeStatus, setNodeStatus] = useState<NodeStatusState>({
    ...DEFAULT_STATUS_STATE,
    ...initialState,
  });

  const updateNodeStatus = useCallback((
    status: NodeStatus, 
    progress: number = 0, 
    message?: string,
    error?: string
  ) => {
    setNodeStatus(prev => ({
      ...prev,
      status,
      progress: status === 'success' ? 100 : progress,
      message,
      error,
      ...(status === 'success' ? { endTime: Date.now() } : {}),
      ...(status === 'processing' && !prev.startTime ? { startTime: Date.now() } : {})
    }));
  }, []);

  // Subscribe to real-time updates if workflow ID is available
  useEffect(() => {
    if (!workflowId || !nodeId) return;

    // Initial status check
    const fetchNodeStatus = async () => {
      try {
        // Fix: Use type-safe table name - ensure tableName is a valid table
        if (tableName !== 'workflow_files') {
          console.error(`Table ${tableName} is not implemented for status tracking`);
          return;
        }

        const { data, error } = await supabase
          .from('workflow_files')
          .select('status, metadata')
          .eq('workflow_id', workflowId)
          .eq('node_id', nodeId)
          .single();

        if (error) {
          console.error('Error fetching node status:', error);
          return;
        }

        if (data) {
          const fileStatus = data.status;
          const metadata = data.metadata || {};
          
          // Map database status to our NodeStatus type
          let nodeStatus: NodeStatus = 'idle';
          let progress = metadata.progress || 0;
          
          switch (fileStatus) {
            case 'pending':
              nodeStatus = 'idle';
              break;
            case 'processing':
            case 'uploading':
            case 'queued':
              nodeStatus = 'processing';
              break;
            case 'completed':
              nodeStatus = 'success';
              progress = 100;
              break;
            case 'failed':
            case 'error':
              nodeStatus = 'error';
              break;
            default:
              nodeStatus = 'idle';
          }
          
          updateNodeStatus(
            nodeStatus, 
            progress, 
            metadata.message, 
            metadata.error
          );
        }
      } catch (err) {
        console.error('Error in fetchNodeStatus:', err);
      }
    };

    fetchNodeStatus();
    
    // Set up real-time subscription
    const subscription = supabase
      .channel(`node-status-${nodeId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: tableName,
        filter: `workflow_id=eq.${workflowId} AND node_id=eq.${nodeId}`,
      }, (payload) => {
        const data = payload.new;
        
        if (data) {
          const fileStatus = data.status;
          const metadata = data.metadata || {};
          
          // Map database status to our NodeStatus type
          let nodeStatus: NodeStatus = 'idle';
          let progress = metadata.progress || 0;
          
          switch (fileStatus) {
            case 'pending':
              nodeStatus = 'idle';
              break;
            case 'processing':
            case 'uploading':
            case 'queued':
              nodeStatus = 'processing';
              break;
            case 'completed':
              nodeStatus = 'success';
              progress = 100;
              break;
            case 'failed':
            case 'error':
              nodeStatus = 'error';
              break;
            default:
              nodeStatus = 'idle';
          }
          
          updateNodeStatus(
            nodeStatus, 
            progress, 
            metadata.message, 
            metadata.error
          );
        }
      })
      .subscribe();

    // Clean up subscription
    return () => {
      supabase.removeChannel(subscription);
    };
  }, [workflowId, nodeId, tableName, updateNodeStatus]);

  // Map FileProcessingStatus (from the existing system) to our NodeStatus
  const mapFileProcessingStatus = useCallback((status: FileProcessingStatus): NodeStatus => {
    switch (status) {
      case 'pending':
        return 'idle';
      case 'uploading':
      case 'associating':
      case 'processing':
      case 'fetching_schema':
      case 'verifying':
        return 'processing';
      case 'completed':
        return 'success';
      case 'failed':
      case 'error':
        return 'error';
      default:
        return 'idle';
    }
  }, []);

  // Update status from external file processing state
  const updateFromFileProcessingState = useCallback((fileProcessingState: {
    status: FileProcessingStatus;
    progress: number;
    message?: string;
    error?: string;
  }) => {
    updateNodeStatus(
      mapFileProcessingStatus(fileProcessingState.status),
      fileProcessingState.progress,
      fileProcessingState.message,
      fileProcessingState.error
    );
  }, [updateNodeStatus, mapFileProcessingStatus]);

  return {
    nodeStatus,
    updateNodeStatus,
    updateFromFileProcessingState,
    // Convenience getters
    isProcessing: nodeStatus.status === 'processing' || nodeStatus.status === 'loading',
    isSuccess: nodeStatus.status === 'success',
    isError: nodeStatus.status === 'error',
    isIdle: nodeStatus.status === 'idle'
  };
}
