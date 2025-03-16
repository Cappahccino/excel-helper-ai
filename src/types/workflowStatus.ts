
import { FileProcessingState, FileProcessingStates } from './fileProcessing';

// Define our workflow status enums
export enum WorkflowFileStatus {
  Pending = 'pending',
  Queued = 'queued',
  Processing = 'processing',
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
      return FileProcessingStates.PENDING;
    case WorkflowFileStatus.Queued:
      return FileProcessingStates.QUEUING;
    case WorkflowFileStatus.Processing:
      return FileProcessingStates.PROCESSING;
    case WorkflowFileStatus.Completed:
      return FileProcessingStates.COMPLETED;
    case WorkflowFileStatus.Failed:
      return FileProcessingStates.FAILED;
    case WorkflowFileStatus.Error:
      return FileProcessingStates.ERROR;
    default:
      return FileProcessingStates.PENDING;
  }
};
