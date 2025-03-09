
import React from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface NodeProgressProps {
  value: number;
  status?: 'default' | 'success' | 'error' | 'warning' | 'info';
  showLabel?: boolean;
  className?: string;
}

const NodeProgress: React.FC<NodeProgressProps> = ({
  value,
  status = 'default',
  showLabel = false,
  className,
}) => {
  // Map status to color classes
  const statusClasses = {
    default: 'bg-blue-500',
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-sky-500',
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="relative">
        <Progress 
          value={value} 
          className="h-1.5 bg-gray-100"
          indicatorClassName={statusClasses[status]}
        />
        {showLabel && (
          <div className="text-[10px] text-gray-500 mt-0.5 text-right">
            {Math.round(value)}%
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeProgress;
