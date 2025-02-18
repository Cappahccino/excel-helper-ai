
import { Message } from "./chat";
import { Json } from "@/integrations/supabase/types";

export type MessageMetadata = {
  reaction_counts?: {
    positive: number;
    negative: number;
  };
  processing_stage?: {
    stage: string;
    started_at: number;
    last_updated: number;
    completion_percentage?: number;
  };
  user_reaction?: boolean | null;
  edit_history?: Array<{
    previous_content: string;
    edited_at: string;
  }>;
} | null;

export type DatabaseMessage = {
  id: string;
  content: string;
  role: string;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  excel_file_id: string | null;
  excel_files: {
    filename: string;
    file_size: number;
  } | null;
  status: Message['status'];
  version: string | null;
  deployment_id: string | null;
  cleanup_after: string | null;
  cleanup_reason: string | null;
  deleted_at: string | null;
  is_ai_response: boolean | null;
  metadata: Json;
};
