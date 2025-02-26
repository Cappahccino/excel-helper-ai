
export interface ExcelData {
  sheet: string;
  headers: string[];
  data: Record<string, any>[];
}

export interface ProcessingError {
  fileId: string;
  error: string;
  stage: 'validation' | 'download' | 'processing';
}

export interface ProcessingResponse {
  success: boolean;
  data?: ExcelData[];
  errors?: ProcessingError[];
  metadata: {
    processedFiles: number;
    totalFiles: number;
    processingTime: number;
  };
}
