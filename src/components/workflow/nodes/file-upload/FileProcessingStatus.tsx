
import React from 'react';
import { Loader2, Upload, RefreshCw, Database, AlertCircle, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NodeProgress from '../../ui/NodeProgress';
import { FileProcessingState } from '@/types/workflowStatus';
import { Spinner } from '@/components/ui/spinner';
import { EnhancedProcessingState, LoadingIndicatorState } from '@/types/fileProcessing';

interface FileProcessingStatusProps {
  state: EnhancedProcessingState;
  loadingState: LoadingIndicatorState;
  onRetry: () => void;
}

const FileProcessingStatus: React.FC<FileProcessingStatusProps> = ({
  state,
  loadingState,
  onRetry,
}) => {
  const { status, progress, error, processingDuration } = state;
  const { showSpinner, pulseAnimation, progressVisible } = loadingState;
  
  // Status-specific colors for progress
  const statusMap: Record<FileProcessingState, {
    statusComponent: React.ReactNode,
    progressStatus: 'default' | 'success' | 'error' | 'warning' | 'info'
  }> = {
    pending: {
      statusComponent: null,
      progressStatus: 'default'
    },
    associating: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-blue-600 animate-fade-in p-1.5 rounded hover:bg-blue-50 transition-colors">
          {showSpinner && <Spinner variant="circle" className="h-3 w-3" />}
          <span>{state.displayMessage || 'Associating file...'}</span>
          {processingDuration && <span className="ml-auto text-[10px] text-gray-400">{processingDuration}</span>}
        </div>
      ),
      progressStatus: 'default'
    },
    queuing: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-blue-600 animate-fade-in p-1.5 rounded hover:bg-blue-50 transition-colors">
          <Upload className={`h-3 w-3 ${pulseAnimation ? 'animate-pulse' : ''}`} />
          <span>{state.displayMessage || 'Queuing file...'}</span>
          {processingDuration && <span className="ml-auto text-[10px] text-gray-400">{processingDuration}</span>}
        </div>
      ),
      progressStatus: 'default'
    },
    processing: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-blue-600 animate-fade-in p-1.5 rounded hover:bg-blue-50 transition-colors">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>{state.displayMessage || 'Processing file...'}</span>
          {processingDuration && <span className="ml-auto text-[10px] text-gray-400">{processingDuration}</span>}
        </div>
      ),
      progressStatus: 'default'
    },
    fetching_schema: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-sky-600 animate-fade-in p-1.5 rounded hover:bg-sky-50 transition-colors">
          <Database className={`h-3 w-3 ${pulseAnimation ? 'animate-pulse' : ''}`} />
          <span>{state.displayMessage || 'Fetching schema...'}</span>
          {processingDuration && <span className="ml-auto text-[10px] text-gray-400">{processingDuration}</span>}
        </div>
      ),
      progressStatus: 'info'
    },
    verifying: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-amber-600 animate-fade-in p-1.5 rounded hover:bg-amber-50 transition-colors">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>{state.displayMessage || 'Verifying data...'}</span>
          {processingDuration && <span className="ml-auto text-[10px] text-gray-400">{processingDuration}</span>}
        </div>
      ),
      progressStatus: 'warning'
    },
    completed: {
      statusComponent: (
        <div className="flex items-center gap-2 text-xs text-green-600 animate-fade-in p-1.5 rounded hover:bg-green-50 transition-colors">
          <Check className="h-3 w-3" />
          <span>{state.displayMessage || 'File ready'}</span>
          {processingDuration && <span className="ml-auto text-[10px] text-gray-400">{processingDuration}</span>}
        </div>
      ),
      progressStatus: 'success'
    },
    failed: {
      statusComponent: (
        <div className="bg-red-50 p-2 rounded-md border border-red-100 text-xs text-red-600 flex items-start gap-2 animate-fade-in shadow-sm hover:bg-red-100 transition-colors">
          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium">Error:</span> {error || 'Processing failed'}
          </div>
        </div>
      ),
      progressStatus: 'error'
    },
    error: {
      statusComponent: (
        <div className="bg-red-50 p-2 rounded-md border border-red-100 text-xs text-red-600 flex items-start gap-2 animate-fade-in shadow-sm hover:bg-red-100 transition-colors">
          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium">Error:</span> {error || 'Unknown error occurred'}
          </div>
        </div>
      ),
      progressStatus: 'error'
    }
  };
  
  const { statusComponent, progressStatus } = statusMap[status as FileProcessingState];
  
  return (
    <>
      {statusComponent}
      {progressVisible && (
        <NodeProgress 
          value={progress} 
          status={progressStatus} 
          showLabel={true} 
          className="mt-2 animate-fade-in" 
          animated={pulseAnimation}
        />
      )}
      {state.isError && (
        <Button 
          size="sm" 
          variant="outline" 
          className="mt-2 w-full text-xs h-7 animate-fade-in transition-all duration-300 hover:bg-red-50 border-red-200 hover:border-red-300 group"
          onClick={onRetry}
        >
          <RefreshCw className="h-3 w-3 mr-1 group-hover:rotate-180 transition-transform duration-500" /> Retry
        </Button>
      )}
    </>
  );
};

export default FileProcessingStatus;
