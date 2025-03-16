
import { EnhancedProcessingState, LoadingIndicatorState } from '@/types/fileProcessing';

export interface SheetMetadata {
  name: string;
  index: number;
  rowCount?: number;
  isDefault?: boolean;
}

export interface FileUploadNodeConfig {
  fileId?: string;
  filename?: string;
  hasHeaders?: boolean;
  delimiter?: string;
  selectedSheet?: string;
}

export interface FileUploadNodeData {
  label: string;
  config?: FileUploadNodeConfig;
  onChange?: (nodeId: string, config: any) => void;
  workflowId?: string;
}

export interface FileInfo {
  id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  processing_status?: string;
  error_message?: string;
  file_metadata?: {
    row_count?: number;
    sheets_metadata?: SheetMetadata[];
    [key: string]: any;
  };
  [key: string]: any;
}

export interface SheetSchema {
  columns: string[];
  data_types: Record<string, string>;
  sample_data: any[];
}
