
import React from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface NodeProgressProps {
  value: number;
  status?: 'default' | 'success' | 'error' | 'warning' | 'info';
  showLabel?: boolean;
  className?: string;
  processingStatus?: string;
  animated?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const NodeProgress: React.FC<NodeProgressProps> = ({
  value,
  status = 'default',
  showLabel = false,
  className,
  processingStatus,
  animated = false,
  size = 'sm',
}) => {
  // Map status to color classes
  const statusClasses = {
    default: 'bg-blue-500',
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-sky-500',
  };

  // Height based on size
  const heightClass = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3'
  }[size];

  return (
    <div className={cn("w-full", className)}>
      <div className="relative">
        <Progress 
          value={value} 
          className={cn("bg-gray-100 overflow-hidden rounded-full", heightClass, animated ? 'animate-pulse' : '')}
          indicatorClassName={cn(
            statusClasses[status], 
            animated ? 'animate-pulse' : '',
            "transition-all duration-500 ease-in-out"
          )}
        />
        {showLabel && (
          <div className="text-[10px] text-gray-500 mt-0.5 text-right transition-opacity duration-300">
            {Math.round(value)}%
          </div>
        )}
        {processingStatus && (
          <div className="text-[10px] text-gray-500 mt-0.5 transition-opacity duration-300">
            {processingStatus}
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeProgress;
