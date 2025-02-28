
export interface GeneratedImage {
  id: string;
  openai_file_id: string;
  created_at?: string;
  cached?: boolean;
  last_accessed?: string;
  prompt?: string;
  model?: string;
  size?: string;
}

export interface DatabaseMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  session_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  status: 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';
  deployment_id?: string;
  cleanup_after?: string;
  cleanup_reason?: string;
  user_id: string;
  version: string;
  migration_verified: boolean;
  is_ai_response: boolean;
  message_files?: Array<{
    file_id: string;
    role: string;
    excel_files?: {
      id: string;
      filename: string;
      file_size: number;
    };
  }>;
  metadata?: {
    processing_stage?: {
      stage: string;
      started_at: number;
      last_updated: number;
      completion_percentage?: number;
    };
    reaction_counts?: {
      positive: number;
      negative: number;
    };
    edit_history?: Array<{
      previous_content: string;
      edited_at: string;
    }>;
    is_multi_file?: boolean;
    file_count?: number;
    has_code_output?: boolean;
    code_outputs?: Array<{
      type: string;
      file_id: string;
    }>;
    has_images?: boolean;
    image_count?: number;
    generated_images?: GeneratedImage[];
  };
}
