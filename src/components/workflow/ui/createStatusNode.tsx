
import React from 'react';
import { useNodeStatus, UseNodeStatusOptions } from '@/hooks/useNodeStatus';
import NodeStatusWrapper from './NodeStatusWrapper';

export type StatusNodeConfigFactory<T> = (props: T) => Omit<UseNodeStatusOptions, 'initialState'> & {
  showProgressBar?: boolean;
  showStatusText?: boolean;
};

export function createStatusNode<T extends { id: string; selected: boolean; data?: any }>(
  WrappedComponent: React.ComponentType<T>,
  configFactory: StatusNodeConfigFactory<T>
) {
  // Return a new component that wraps the original node component
  return function EnhancedNode(props: T) {
    // Get node status configuration
    const config = configFactory(props);
    
    // Use the status hook
    const { 
      nodeStatus, 
      updateNodeStatus,
      isProcessing 
    } = useNodeStatus({
      workflowId: config.workflowId,
      nodeId: config.nodeId,
      tableName: config.tableName,
      pollingInterval: config.pollingInterval
    });

    // Generate status text based on current status
    const getStatusText = () => {
      if (nodeStatus.message) return nodeStatus.message;
      
      switch (nodeStatus.status) {
        case 'loading':
          return 'Loading...';
        case 'processing':
          return 'Processing...';
        case 'success':
          return 'Completed';
        case 'error':
          return 'Error occurred';
        default:
          return '';
      }
    };

    return (
      <NodeStatusWrapper
        status={nodeStatus.status}
        selected={props.selected}
        progress={nodeStatus.progress}
        errorMessage={nodeStatus.error}
        statusText={config.showStatusText ? getStatusText() : undefined}
        showProgressBar={config.showProgressBar && isProcessing}
        className=""
      >
        <WrappedComponent {...props} />
      </NodeStatusWrapper>
    );
  };
}
