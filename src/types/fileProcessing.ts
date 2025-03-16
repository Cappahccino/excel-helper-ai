
export type FileProcessingStatus = 
  | 'pending' 
  | 'associating'
  | 'uploading' 
  | 'processing' 
  | 'fetching_schema'
  | 'verifying'
  | 'completed' 
  | 'failed'
  | 'error'
  | 'queuing';  // Added this to match FileProcessingState.Queuing

export interface FileProcessingState {
  status: FileProcessingStatus;
  progress: number;
  message?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
  isLoading?: boolean;
}

export interface EnhancedProcessingState extends FileProcessingState {
  isProcessing: boolean;
  isComplete: boolean;
  isError: boolean;
  isPending: boolean;
  displayMessage: string;
  elapsedTimeMs?: number;
  processingDuration?: string;
}

export interface LoadingIndicatorState {
  showGlow: boolean;
  glowColor: string;
  pulseAnimation: boolean;
  progressVisible: boolean;
  showSpinner: boolean;
}

export interface WorkflowUploadResponse {
  success: boolean;
  file_id?: string;
  error?: string;
}

export type FileUploadRPCFunction = {
  workflow_upload_file: (args: {
    p_workflow_id: string;
    p_node_id: string;
    p_file_path: string;
    p_file_name: string;
    p_file_size: number;
    p_mime_type: string;
    p_user_id: string;
    p_is_temporary?: boolean;
  }) => Promise<{ data: WorkflowUploadResponse; error: any }>;
  
  associate_file_with_workflow_node: (args: {
    p_file_id: string;
    p_workflow_id: string;
    p_node_id: string;
  }) => Promise<{ data: boolean; error: any }>;
}
