
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

export type FileProcessingState = FileProcessingStatus;

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
