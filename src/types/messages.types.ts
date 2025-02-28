
import { Message } from "./chat";
import { Json } from "@/integrations/supabase/types";
import { Tag } from "./tags";

export type MessageFile = {
  file_id: string;
  role: string;
  excel_files?: {
    filename: string;
    file_size: number;
  };
  tags?: Tag[];
};

export type MessageImage = {
  file_id: string;
  image_url?: string;
  file_type?: string;
};

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
  tags?: Tag[];
  has_code_output?: boolean;
  code_outputs?: Array<{
    type: string;
    file_id: string;
  }>;
  images?: MessageImage[];
} | null;

export type DatabaseMessage = {
  id: string;
  content: string;
  role: string;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  deployment_id: string | null;
  cleanup_after: string | null;
  cleanup_reason: string | null;
  deleted_at: string | null;
  is_ai_response: boolean | null;
  message_files?: MessageFile[];
  status: Message['status'];
  version: string | null;
  metadata: Json;
};
