
export type MessageStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  session_id: string | null;
  created_at: string;
  updated_at: string;
  excel_file_id: string | null;
  excel_files?: {
    filename: string;
    file_size: number;
  } | null;
  status: MessageStatus;
  version?: string;
  deployment_id?: string;
  cleanup_after?: string;
  cleanup_reason?: string;
  deleted_at?: string | null;
  temp?: boolean;
}

export interface SessionData {
  session_id: string;
  thread_id: string | null;
}

export interface MessagesResponse {
  messages: Message[];
  nextCursor: string | null;
}
