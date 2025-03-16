
import React from 'react';
import { cn } from '@/lib/utils';
import { NodeStatus } from '@/hooks/useNodeStatus';
import NodeProgress from './NodeProgress';

interface NodeStatusWrapperProps {
  children: React.ReactNode;
  status: NodeStatus;
  selected: boolean;
  progress?: number;
  errorMessage?: string;
  statusText?: string;
  showProgressBar?: boolean;
  className?: string;
}

const NodeStatusWrapper: React.FC<NodeStatusWrapperProps> = ({
  children,
  status,
  selected,
  progress = 0,
  errorMessage,
  statusText,
  showProgressBar = true,
  className,
}) => {
  // Status-specific styling
  const getStatusStyling = () => {
    switch (status) {
      case 'processing':
      case 'loading':
        return {
          borderColor: 'border-blue-400',
          shadow: 'shadow-glow-processing',
          progressStatus: 'default' as const
        };
      case 'success':
        return {
          borderColor: 'border-green-400',
          shadow: 'shadow-glow-success',
          progressStatus: 'success' as const
        };
      case 'error':
        return {
          borderColor: 'border-red-400',
          shadow: 'shadow-glow-error',
          progressStatus: 'error' as const
        };
      default:
        return {
          borderColor: selected ? 'border-primary' : 'border-gray-200',
          shadow: selected ? 'shadow-md' : 'shadow',
          progressStatus: 'default' as const
        };
    }
  };

  const { borderColor, shadow, progressStatus } = getStatusStyling();

  return (
    <div
      className={cn(
        "rounded-md border-2 bg-white transition-all duration-300",
        borderColor,
        shadow,
        className
      )}
    >
      {children}
      
      {/* Status indicators */}
      {status === 'processing' && statusText && (
        <div className="px-4 pb-3">
          <div className="text-xs text-blue-600 flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></div>
            <span>{statusText}</span>
          </div>
          
          {showProgressBar && (
            <NodeProgress 
              value={progress} 
              status={progressStatus} 
              showLabel={true}
              className="mt-2" 
            />
          )}
        </div>
      )}
      
      {status === 'error' && errorMessage && (
        <div className="px-4 pb-3">
          <div className="bg-red-50 p-2 rounded-md text-xs text-red-600 border border-red-100">
            {errorMessage}
          </div>
        </div>
      )}
    </div>
  );
};

export default NodeStatusWrapper;
