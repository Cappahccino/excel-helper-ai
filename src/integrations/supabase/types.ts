export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      chat_messages: {
        Row: {
          cleanup_after: string | null
          cleanup_reason: string | null
          content: string
          created_at: string
          deleted_at: string | null
          deployment_id: string | null
          excel_file_id: string | null
          id: string
          is_ai_response: boolean | null
          metadata: Json | null
          openai_message_id: string | null
          openai_run_id: string | null
          raw_response: Json | null
          role: string
          session_id: string | null
          status: Database["public"]["Enums"]["message_status"]
          thread_message_id: string | null
          updated_at: string | null
          user_id: string
          version: string | null
        }
        Insert: {
          cleanup_after?: string | null
          cleanup_reason?: string | null
          content: string
          created_at?: string
          deleted_at?: string | null
          deployment_id?: string | null
          excel_file_id?: string | null
          id?: string
          is_ai_response?: boolean | null
          metadata?: Json | null
          openai_message_id?: string | null
          openai_run_id?: string | null
          raw_response?: Json | null
          role?: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          thread_message_id?: string | null
          updated_at?: string | null
          user_id: string
          version?: string | null
        }
        Update: {
          cleanup_after?: string | null
          cleanup_reason?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          deployment_id?: string | null
          excel_file_id?: string | null
          id?: string
          is_ai_response?: boolean | null
          metadata?: Json | null
          openai_message_id?: string | null
          openai_run_id?: string | null
          raw_response?: Json | null
          role?: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          thread_message_id?: string | null
          updated_at?: string | null
          user_id?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "fk_chat_messages_excel_files"
            columns: ["excel_file_id"]
            isOneToOne: false
            referencedRelation: "excel_files"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          assistant_id: string | null
          chat_name: string | null
          created_at: string
          excel_file_id: string | null
          last_run_id: string | null
          openai_model: string | null
          openai_usage: Json | null
          session_id: string
          status: string
          thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assistant_id?: string | null
          chat_name?: string | null
          created_at?: string
          excel_file_id?: string | null
          last_run_id?: string | null
          openai_model?: string | null
          openai_usage?: Json | null
          session_id?: string
          status?: string
          thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assistant_id?: string | null
          chat_name?: string | null
          created_at?: string
          excel_file_id?: string | null
          last_run_id?: string | null
          openai_model?: string | null
          openai_usage?: Json | null
          session_id?: string
          status?: string
          thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_excel_file_id_fkey"
            columns: ["excel_file_id"]
            isOneToOne: false
            referencedRelation: "excel_files"
            referencedColumns: ["id"]
          },
        ]
      }
      excel_files: {
        Row: {
          created_at: string
          deleted_at: string | null
          error_message: string | null
          file_hash: string | null
          file_path: string
          file_size: number
          file_version: number | null
          filename: string
          id: string
          last_accessed_at: string | null
          max_retries: number | null
          mime_type: string | null
          processed_chunks: number | null
          processing_completed_at: string | null
          processing_started_at: string | null
          processing_status:
            | Database["public"]["Enums"]["file_processing_status"]
            | null
          retry_count: number | null
          storage_verified: boolean | null
          total_chunks: number | null
          upload_progress: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          error_message?: string | null
          file_hash?: string | null
          file_path: string
          file_size: number
          file_version?: number | null
          filename: string
          id?: string
          last_accessed_at?: string | null
          max_retries?: number | null
          mime_type?: string | null
          processed_chunks?: number | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          processing_status?:
            | Database["public"]["Enums"]["file_processing_status"]
            | null
          retry_count?: number | null
          storage_verified?: boolean | null
          total_chunks?: number | null
          upload_progress?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          error_message?: string | null
          file_hash?: string | null
          file_path?: string
          file_size?: number
          file_version?: number | null
          filename?: string
          id?: string
          last_accessed_at?: string | null
          max_retries?: number | null
          mime_type?: string | null
          processed_chunks?: number | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          processing_status?:
            | Database["public"]["Enums"]["file_processing_status"]
            | null
          retry_count?: number | null
          storage_verified?: boolean | null
          total_chunks?: number | null
          upload_progress?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_orphaned_files: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_orphaned_messages: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      file_processing_status:
        | "pending"
        | "uploading"
        | "processing"
        | "analyzing"
        | "completed"
        | "error"
      message_status:
        | "queued"
        | "in_progress"
        | "completed"
        | "failed"
        | "cancelled"
        | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
