
export interface RequestBody {
  fileId?: string | null;
  query: string;
  userId: string;
  sessionId?: string | null;
  threadId?: string | null;
  messageId?: string;
}

export interface MessageResponse {
  message: string;
  messageId: string | null;
  sessionId: string;
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  session_id: string;
  created_at: string;
  updated_at: string;
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';
  metadata?: {
    processing_stage?: {
      stage: string;
      started_at: number;
      last_updated: number;
      completion_percentage?: number;
    };
  } | null;
}
