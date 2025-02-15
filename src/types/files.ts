
export interface ExcelFile {
  id: string;
  filename: string;
  file_size: number;
  created_at: string;
  file_path: string;
  storage_verified: boolean;
  last_accessed_at: string | null;
  mime_type: string | null;
  deleted_at: string | null;
  file_version: number;
  processing_status: string;
}
