
export interface RequestBody {
  fileIds?: string[] | null;
  query: string;
  userId: string;
  sessionId: string;
  messageId: string;
  threadId?: string | null;
}

export interface ExcelData {
  sheet: string;
  headers: string[];
  data: Record<string, any>[];
}

export interface ProcessedFileContext {
  fileId: string;
  fileName: string;
  data: ExcelData[];
}
