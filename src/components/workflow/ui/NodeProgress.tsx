
import React from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Loader2, Upload, RefreshCw, Database, AlertCircle, Check, Info } from 'lucide-react';

interface NodeProgressProps {
  value: number;
  status?: 'default' | 'success' | 'error' | 'warning' | 'info';
  showLabel?: boolean;
  className?: string;
  processingStatus?: string;
  animated?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const NodeProgress: React.FC<NodeProgressProps> = ({
  value,
  status = 'default',
  showLabel = false,
  className,
  processingStatus,
  animated = false,
  size = 'sm',
  showIcon = false,
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
  
  // Icon mapping
  const statusIcon = {
    default: <Loader2 className="h-3 w-3 animate-spin" />,
    success: <Check className="h-3 w-3" />,
    error: <AlertCircle className="h-3 w-3" />,
    warning: <Info className="h-3 w-3" />,
    info: <Database className="h-3 w-3" />
  }[status];

  return (
    <div className={cn("w-full", className)}>
      <div className="relative">
        <Progress 
          value={value} 
          className={cn("bg-gray-100", heightClass, animated ? 'animate-pulse' : '')}
          indicatorClassName={cn(statusClasses[status], animated ? 'animate-pulse' : '')}
        />
        <div className="flex items-center justify-between mt-0.5">
          {showIcon && (
            <div className={cn("text-xs", {
              "text-blue-500": status === 'default',
              "text-green-500": status === 'success',
              "text-red-500": status === 'error',
              "text-amber-500": status === 'warning',
              "text-sky-500": status === 'info'
            })}>
              {statusIcon}
            </div>
          )}
          {processingStatus && (
            <div className="text-[10px] text-gray-500">
              {processingStatus}
            </div>
          )}
          {showLabel && (
            <div className={cn("text-[10px] text-gray-500", {
              "ml-auto": processingStatus || showIcon
            })}>
              {Math.round(value)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NodeProgress;
