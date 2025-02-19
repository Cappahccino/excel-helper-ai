
export type TagType = 'system' | 'custom';

export interface Tag {
  id: string;
  name: string;
  type: TagType;
  category: string | null;
  created_at: string;
  is_system: boolean;
}

export interface MessageFileTag {
  message_id: string;
  file_id: string;
  tag_id: string;
  ai_context: string | null;
  usage_count: number;
  created_at: string;
}
