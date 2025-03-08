
/**
 * Possible processing states for workflow file uploads
 */
export type FileProcessingStatus = 
  | 'pending'
  | 'associating' 
  | 'uploading'
  | 'processing'
  | 'fetching_schema'
  | 'verifying'
  | 'completed'
  | 'failed'  // Explicitly include 'failed' status
  | 'error';

/**
 * Processing state information with metadata
 */
export interface FileProcessingState {
  status: FileProcessingStatus;
  progress: number;
  message?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
  previewData?: any[];
  previewColumns?: string[];
  validationErrors?: string[];
}
