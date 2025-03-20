
import React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface NodeProgressProps {
  value: number;
  status?: 'default' | 'success' | 'error' | 'warning' | 'info';
  showLabel?: boolean;
  className?: string;
  processingStatus?: string;
  animated?: boolean;
}

/**
 * A specialized progress bar for workflow nodes
 * Handles different statuses with appropriate styling
 */
const NodeProgress: React.FC<NodeProgressProps> = ({
  value,
  status = 'default',
  showLabel = false,
  className,
  processingStatus,
  animated = false
}) => {
  // Status-specific colors
  const statusColors = {
    default: 'bg-blue-500',
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-sky-500'
  };
  
  const progressColor = statusColors[status];
  
  return (
    <div className={cn("space-y-1", className)}>
      <Progress 
        value={value} 
        className={cn(
          "h-2", 
          status === 'error' && "bg-red-100",
          animated && "animate-pulse"
        )}
        indicatorClassName={progressColor}
      />
      {showLabel && (
        <div className="flex justify-between text-xs text-gray-500">
          <span>{processingStatus || (value < 1 ? 'Starting...' : '')}</span>
          <span>{Math.round(value)}%</span>
        </div>
      )}
    </div>
  );
};

export default NodeProgress;
