
// Define literal string types for file processing statuses
export type FileProcessingStatus = 
  | 'pending' 
  | 'associating'
  | 'queuing'
  | 'uploading' 
  | 'processing' 
  | 'fetching_schema'
  | 'verifying'
  | 'completed' 
  | 'failed'
  | 'error';

// Define the state type as an alias to the status type
export type FileProcessingState = FileProcessingStatus;

// Define a constant object for statuses to use in comparisons
export const FileProcessingStates = {
  PENDING: 'pending' as FileProcessingState,
  ASSOCIATING: 'associating' as FileProcessingState,
  QUEUING: 'queuing' as FileProcessingState,
  UPLOADING: 'uploading' as FileProcessingState,
  PROCESSING: 'processing' as FileProcessingState,
  FETCHING_SCHEMA: 'fetching_schema' as FileProcessingState,
  VERIFYING: 'verifying' as FileProcessingState,
  COMPLETED: 'completed' as FileProcessingState,
  FAILED: 'failed' as FileProcessingState,
  ERROR: 'error' as FileProcessingState
};

export interface FileProcessingProgress {
  status: FileProcessingState;
  progress: number;
  message?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
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

export interface FileSchemaState {
  columns: string[];
  dataTypes: Record<string, string>;
  sampleData?: any[];
  sheetName?: string;
  totalRows?: number;
  hasHeaders: boolean;
}

export interface FileNodeState {
  nodeId: string;
  fileId?: string;
  fileName?: string;
  processingState: FileProcessingProgress;
  schema?: FileSchemaState;
  metadata?: Record<string, any>;
  lastUpdated: number;
}
