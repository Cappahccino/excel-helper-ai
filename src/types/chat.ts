export interface ChatMessage {
  id: string;
  content: string;
  is_ai_response: boolean;
  created_at: string;
  excel_file_id: string;
  user_id: string;
}