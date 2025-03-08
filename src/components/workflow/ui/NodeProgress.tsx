
import React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { FileProcessingStatus } from '@/types/fileProcessing';

interface NodeProgressProps {
  value: number;
  status?: 'default' | 'success' | 'error' | 'warning' | 'info';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showPercentage?: boolean;
  className?: string;
  processingStatus?: FileProcessingStatus;
  animated?: boolean;
}

const NodeProgress = ({
  value,
  status = 'default',
  size = 'sm',
  showLabel = false,
  showPercentage = true,
  className,
  processingStatus,
  animated = false
}: NodeProgressProps) => {
  // Color based on status
  const colorClasses = {
    default: 'bg-blue-500',
    success: 'bg-green-500',
    error: 'bg-red-500', 
    warning: 'bg-amber-500',
    info: 'bg-sky-500'
  };
  
  // Background color based on status
  const bgClasses = {
    default: 'bg-blue-100',
    success: 'bg-green-100',
    error: 'bg-red-100',
    warning: 'bg-amber-100',
    info: 'bg-sky-100'
  };
  
  // Height based on size
  const heightClass = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3'
  }[size];

  // Status label mapping (optional)
  const statusLabels: Record<FileProcessingStatus, string> = {
    pending: 'Pending',
    associating: 'Associating',
    uploading: 'Uploading',
    processing: 'Processing',
    fetching_schema: 'Fetching Schema',
    verifying: 'Verifying',
    completed: 'Completed',
    failed: 'Failed',
    error: 'Error'
  };
  
  return (
    <div className={cn('w-full', className)}>
      <Progress 
        value={value} 
        className={cn(heightClass, bgClasses[status], animated ? 'animate-pulse' : '')}
        indicatorClassName={cn(colorClasses[status], animated ? 'animate-pulse' : '')}
      />
      
      <div className="flex justify-between mt-1">
        {showLabel && processingStatus && (
          <span className="text-xs text-gray-600">{statusLabels[processingStatus]}</span>
        )}
        
        {showPercentage && (
          <span className="text-xs text-gray-500 ml-auto">{Math.round(value)}%</span>
        )}
      </div>
    </div>
  );
};

export default NodeProgress;
