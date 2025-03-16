
// Define our workflow status enums
export enum WorkflowFileStatus {
  Pending = 'pending',
  Queued = 'queued',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Error = 'error'
}

// Define our file processing state for UI representation
export type FileProcessingState = 
  | 'pending'
  | 'associating' 
  | 'queuing'
  | 'processing'
  | 'fetching_schema'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'error';

// Map database status to UI status
export const mapWorkflowStatusToProcessingState = (
  dbStatus: WorkflowFileStatus
): FileProcessingState => {
  switch (dbStatus) {
    case WorkflowFileStatus.Pending:
      return 'pending';
    case WorkflowFileStatus.Queued:
      return 'queuing';
    case WorkflowFileStatus.Processing:
      return 'processing';
    case WorkflowFileStatus.Completed:
      return 'completed';
    case WorkflowFileStatus.Failed:
      return 'failed';
    case WorkflowFileStatus.Error:
      return 'error';
    default:
      return 'pending';
  }
};
