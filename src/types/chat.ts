
export type MessageStatus = 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';

export interface ProcessingStage {
  stage: string;
  started_at: number;
  last_updated: number;
  completion_percentage?: number;
}

export interface MessageImage {
  file_id: string;
  image_url?: string;
  file_type?: string;
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  session_id: string | null;
  created_at: string;
  updated_at: string;
  status: MessageStatus;
  version?: string;
  deployment_id?: string;
  cleanup_after?: string;
  cleanup_reason?: string;
  deleted_at?: string | null;
  temp?: boolean;
  is_ai_response?: boolean;
  message_files?: {
    file_id: string;
    role: string;
    filename?: string;
    file_size?: number;
  }[];
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
    is_multi_file?: boolean;
    multi_file_message_ids?: string[];
    file_count?: number;
    has_code_output?: boolean;
    code_outputs?: Array<{
      type: string;
      file_id: string;
    }>;
    images?: MessageImage[];
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
