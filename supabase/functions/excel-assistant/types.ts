
export interface RequestBody {
  files?: FileRequest[] | null;
  query: string;
  userId: string;
  sessionId?: string | null;
  threadId?: string | null;
  messageId?: string;
}

export interface FileRequest {
  fileId: string;
  systemRole?: 'primary' | 'reference' | 'supporting';
  tags?: string[];
}

export interface ExcelData {
  sheet: string;
  headers: string[];
  data: any[];
}

export interface ProcessedFileContext {
  fileId: string;
  fileName: string;
  systemRole: string;
  tags: string[];
  data: ExcelData[];
}
