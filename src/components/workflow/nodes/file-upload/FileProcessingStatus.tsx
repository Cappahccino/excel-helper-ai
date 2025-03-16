
import React from 'react';
import { Loader2, Upload, RefreshCw, Database, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NodeProgress from '../../ui/NodeProgress';
import { FileProcessingState, FileProcessingStates } from '@/types/fileProcessing';

interface FileProcessingStatusProps {
  status: FileProcessingState;
  progress: number;
  message?: string;
  error?: string;
  onRetry: () => void;
}

const FileProcessingStatus: React.FC<FileProcessingStatusProps> = ({
  status,
  progress,
  message,
  error,
  onRetry,
}) => {
  // Status-specific colors for progress
  const statusMap: Record<FileProcessingState, {
    statusComponent: React.ReactNode,
    progressStatus: 'default' | 'success' | 'error' | 'warning' | 'info'
  }> = {
    [FileProcessingStates.PENDING]: {
      statusComponent: null,
      progressStatus: 'default'
    },
    [FileProcessingStates.ASSOCIATING]: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-blue-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{message || 'Associating file...'}</span>
        </div>
      ),
      progressStatus: 'default'
    },
    [FileProcessingStates.QUEUING]: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-blue-600">
          <Upload className="h-3 w-3 animate-pulse" />
          <span>{message || 'Queuing file...'}</span>
        </div>
      ),
      progressStatus: 'default'
    },
    [FileProcessingStates.UPLOADING]: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-blue-600">
          <Upload className="h-3 w-3 animate-pulse" />
          <span>{message || 'Uploading file...'}</span>
        </div>
      ),
      progressStatus: 'default'
    },
    [FileProcessingStates.PROCESSING]: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-blue-600">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>{message || 'Processing file...'}</span>
        </div>
      ),
      progressStatus: 'default'
    },
    [FileProcessingStates.FETCHING_SCHEMA]: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-sky-600">
          <Database className="h-3 w-3 animate-pulse" />
          <span>{message || 'Fetching schema...'}</span>
        </div>
      ),
      progressStatus: 'info'
    },
    [FileProcessingStates.VERIFYING]: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-amber-600">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>{message || 'Verifying data...'}</span>
        </div>
      ),
      progressStatus: 'warning'
    },
    [FileProcessingStates.COMPLETED]: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-green-600">
          <Check className="h-3 w-3" />
          <span>{message || 'File ready'}</span>
        </div>
      ),
      progressStatus: 'success'
    },
    [FileProcessingStates.FAILED]: {
      statusComponent: (
        <div className="bg-red-50 p-2 rounded-md border border-red-100 text-xs text-red-600 flex items-start gap-2">
          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium">Error:</span> {error || 'Processing failed'}
          </div>
        </div>
      ),
      progressStatus: 'error'
    },
    [FileProcessingStates.ERROR]: {
      statusComponent: (
        <div className="bg-red-50 p-2 rounded-md border border-red-100 text-xs text-red-600 flex items-start gap-2">
          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium">Error:</span> {error || 'Unknown error occurred'}
          </div>
        </div>
      ),
      progressStatus: 'error'
    }
  };
  
  const { statusComponent, progressStatus } = statusMap[status];
  
  return (
    <>
      {statusComponent}
      {status !== FileProcessingStates.PENDING && status !== FileProcessingStates.COMPLETED && 
       status !== FileProcessingStates.ERROR && status !== FileProcessingStates.FAILED && (
        <NodeProgress 
          value={progress} 
          status={progressStatus} 
          showLabel={true} 
          className="mt-2" 
        />
      )}
      {(status === FileProcessingStates.ERROR || status === FileProcessingStates.FAILED) && (
        <Button 
          size="sm" 
          variant="outline" 
          className="mt-2 w-full text-xs h-7"
          onClick={onRetry}
        >
          <RefreshCw className="h-3 w-3 mr-1" /> Retry
        </Button>
      )}
    </>
  );
};

export default FileProcessingStatus;
