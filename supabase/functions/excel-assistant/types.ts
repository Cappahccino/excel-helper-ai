
export interface ExcelData {
  sheetName: string;
  data: Record<string, any>[];
}

export interface RequestBody {
  userId: string;
  sessionId: string;
  query: string;
  fileId?: string;
}

export interface MessageResponse {
  message: string;
  messageId: string;
  sessionId: string;
}
