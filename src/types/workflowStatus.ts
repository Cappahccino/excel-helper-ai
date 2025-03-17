
// Standard workflow file processing statuses
export enum WorkflowFileStatus {
  Queued = 'queued',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Error = 'error'
}

// Extended UI-specific processing states for more granular feedback
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

// Map backend statuses to UI states
export const mapWorkflowStatusToProcessingState = (
  status: WorkflowFileStatus | string
): FileProcessingState => {
  switch (status) {
    case WorkflowFileStatus.Queued:
      return FileProcessingState.Queuing;
    case WorkflowFileStatus.Processing:
      return FileProcessingState.Processing;
    case WorkflowFileStatus.Completed:
      return FileProcessingState.Completed;
    case WorkflowFileStatus.Failed:
    case WorkflowFileStatus.Error:
      return FileProcessingState.Error;
    default:
      return FileProcessingState.Pending;
  }
};
