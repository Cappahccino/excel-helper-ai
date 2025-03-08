
import React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface NodeProgressProps {
  value: number;
  status?: 'default' | 'success' | 'error' | 'warning' | 'info';
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const NodeProgress = ({
  value,
  status = 'default',
  size = 'sm',
  showLabel = false,
  className
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
  const heightClass = size === 'sm' ? 'h-1.5' : 'h-2';
  
  return (
    <div className={cn('w-full', className)}>
      <Progress 
        value={value} 
        className={cn(heightClass, bgClasses[status])}
        indicatorClassName={colorClasses[status]}
      />
      {showLabel && (
        <div className="flex justify-end mt-1">
          <span className="text-xs text-gray-500">{Math.round(value)}%</span>
        </div>
      )}
    </div>
  );
};

export default NodeProgress;
