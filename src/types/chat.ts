
export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  session_id: string | null;
  created_at: string;
  excel_file_id: string | null;
  excel_files?: {
    filename: string;
    file_size: number;
  } | null;
  temp?: boolean;
}
