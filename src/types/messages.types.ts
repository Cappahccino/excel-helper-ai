
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
