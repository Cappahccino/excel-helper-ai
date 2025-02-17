
export interface ThreadMetadata {
  title: string | null;
  summary: string | null;
}

export interface Thread {
  session_id: string;
  created_at: string;
  thread_id: string | null;
  excel_files: {
    id: string;
    filename: string;
  }[] | null;
  parent_session_id: string | null;
  thread_level: number;
  thread_position: number;
  thread_metadata: ThreadMetadata | null;
  child_threads?: Thread[];
}
