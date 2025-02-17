
export type MessageStatus = 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  session_id: string;
  created_at: string;
  updated_at: string;
  excel_file_id: string | null;
  status: MessageStatus;
  is_ai_response: boolean;
  version?: string;
  metadata?: {
    processing_stage?: {
      stage: string;
      started_at: number;
      last_updated: number;
      completion_percentage?: number;
    };
  } | null;
}
