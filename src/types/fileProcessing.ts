
export type FileProcessingStatus = 
  | 'pending' 
  | 'associating'
  | 'uploading' 
  | 'processing' 
  | 'fetching_schema'
  | 'verifying'
  | 'completed' 
  | 'failed'
  | 'error';

export interface FileProcessingState {
  status: FileProcessingStatus;
  progress: number;
  message?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}
