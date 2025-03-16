
import React from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

type ProgressStatus = 'default' | 'success' | 'error' | 'warning' | 'info';

interface NodeProgressProps {
  value: number;
  status?: ProgressStatus;
  showLabel?: boolean;
  className?: string;
}

const NodeProgress: React.FC<NodeProgressProps> = ({
  value,
  status = 'default',
  showLabel = false,
  className
}) => {
  const statusColors: Record<ProgressStatus, string> = {
    default: 'bg-blue-600',
    success: 'bg-green-600',
    error: 'bg-red-600',
    warning: 'bg-amber-600',
    info: 'bg-sky-600'
  };

  const trackColors: Record<ProgressStatus, string> = {
    default: 'bg-blue-100',
    success: 'bg-green-100',
    error: 'bg-red-100',
    warning: 'bg-amber-100',
    info: 'bg-sky-100'
  };

  return (
    <div className={cn('space-y-1', className)}>
      <Progress 
        value={value} 
        className={cn('h-1.5', trackColors[status])}
        indicatorClassName={statusColors[status]}
      />
      {showLabel && (
        <div className="flex justify-between text-[10px] px-0.5">
          <span className="text-gray-500">Progress</span>
          <span className="font-medium text-gray-700">{Math.round(value)}%</span>
        </div>
      )}
    </div>
  );
};

export default NodeProgress;
