
// Define our workflow status enums
export enum WorkflowFileStatus {
  Pending = 'pending',
  Queued = 'queued',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Error = 'error'
}

// Define our file processing state enum for UI representation
export enum FileProcessingState {
  Pending = 'pending',
  Associating = 'associating', 
  Queuing = 'queuing',
  Processing = 'processing',
  FetchingSchema = 'fetching_schema',
  Verifying = 'verifying',
  Completed = 'completed',
  Failed = 'failed',
  Error = 'error'
}

// Map database status to UI status
export const mapWorkflowStatusToProcessingState = (
  dbStatus: WorkflowFileStatus
): FileProcessingState => {
  switch (dbStatus) {
    case WorkflowFileStatus.Pending:
      return FileProcessingState.Pending;
    case WorkflowFileStatus.Queued:
      return FileProcessingState.Queuing;
    case WorkflowFileStatus.Processing:
      return FileProcessingState.Processing;
    case WorkflowFileStatus.Completed:
      return FileProcessingState.Completed;
    case WorkflowFileStatus.Failed:
      return FileProcessingState.Failed;
    case WorkflowFileStatus.Error:
      return FileProcessingState.Error;
    default:
      return FileProcessingState.Pending;
  }
};
