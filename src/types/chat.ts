
export type MessageStatus = 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';

export interface ProcessingStage {
  stage: string;
  started_at: number;
  last_updated: number;
  completion_percentage?: number;
}

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
  is_ai_response?: boolean;
  metadata?: {
    reaction_counts?: {
      positive: number;
      negative: number;
    };
    processing_stage?: ProcessingStage;
    user_reaction?: boolean | null;
    edit_history?: Array<{
      previous_content: string;
      edited_at: string;
    }>;
  } | null;
}

export interface SessionData {
  session_id: string;
  thread_id: string | null;
}

export interface MessagesResponse {
  messages: Message[];
  nextCursor: string | null;
}
