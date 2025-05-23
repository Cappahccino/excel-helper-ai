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
      api_credentials: {
        Row: {
          created_at: string
          credentials: Json
          credentials_type: string
          expires_at: string | null
          id: string
          is_valid: boolean
          last_used_at: string | null
          name: string
          service: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credentials: Json
          credentials_type: string
          expires_at?: string | null
          id?: string
          is_valid?: boolean
          last_used_at?: string | null
          name: string
          service: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credentials?: Json
          credentials_type?: string
          expires_at?: string | null
          id?: string
          is_valid?: boolean
          last_used_at?: string | null
          name?: string
          service?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          cleanup_after: string | null
          cleanup_reason: string | null
          content: string
          created_at: string
          deleted_at: string | null
          deployment_id: string | null
          id: string
          is_ai_response: boolean | null
          metadata: Json | null
          migration_verified: boolean | null
          openai_message_id: string | null
          openai_run_id: string | null
          processing_stage: Json | null
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
          id?: string
          is_ai_response?: boolean | null
          metadata?: Json | null
          migration_verified?: boolean | null
          openai_message_id?: string | null
          openai_run_id?: string | null
          processing_stage?: Json | null
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
          id?: string
          is_ai_response?: boolean | null
          metadata?: Json | null
          migration_verified?: boolean | null
          openai_message_id?: string | null
          openai_run_id?: string | null
          processing_stage?: Json | null
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
          parent_session_id: string | null
          session_id: string
          status: string
          thread_id: string | null
          thread_level: number | null
          thread_metadata: Json | null
          thread_position: number | null
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
          parent_session_id?: string | null
          session_id?: string
          status?: string
          thread_id?: string | null
          thread_level?: number | null
          thread_metadata?: Json | null
          thread_position?: number | null
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
          parent_session_id?: string | null
          session_id?: string
          status?: string
          thread_id?: string | null
          thread_level?: number | null
          thread_metadata?: Json | null
          thread_position?: number | null
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
          {
            foreignKeyName: "chat_sessions_parent_session_id_fkey"
            columns: ["parent_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["session_id"]
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
      file_metadata: {
        Row: {
          column_definitions: Json | null
          created_at: string | null
          data_summary: Json | null
          file_id: string | null
          id: string
          row_count: number | null
          sheets_metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          column_definitions?: Json | null
          created_at?: string | null
          data_summary?: Json | null
          file_id?: string | null
          id?: string
          row_count?: number | null
          sheets_metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          column_definitions?: Json | null
          created_at?: string | null
          data_summary?: Json | null
          file_id?: string | null
          id?: string
          row_count?: number | null
          sheets_metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_metadata_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "excel_files"
            referencedColumns: ["id"]
          },
        ]
      }
      file_tags: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          is_system: boolean | null
          metadata: Json | null
          name: string
          type: Database["public"]["Enums"]["tag_type"] | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          metadata?: Json | null
          name: string
          type?: Database["public"]["Enums"]["tag_type"] | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          metadata?: Json | null
          name?: string
          type?: Database["public"]["Enums"]["tag_type"] | null
          user_id?: string | null
        }
        Relationships: []
      }
      message_file_tags: {
        Row: {
          ai_context: string | null
          created_at: string | null
          file_id: string
          message_id: string
          tag_id: string
          usage_count: number | null
        }
        Insert: {
          ai_context?: string | null
          created_at?: string | null
          file_id: string
          message_id: string
          tag_id: string
          usage_count?: number | null
        }
        Update: {
          ai_context?: string | null
          created_at?: string | null
          file_id?: string
          message_id?: string
          tag_id?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_file_tags_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "excel_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_file_tags_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_file_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "file_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      message_files: {
        Row: {
          created_at: string | null
          file_id: string
          message_id: string
          role: string | null
        }
        Insert: {
          created_at?: string | null
          file_id: string
          message_id: string
          role?: string | null
        }
        Update: {
          created_at?: string | null
          file_id?: string
          message_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "excel_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_files_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_generated_images: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          file_type: string | null
          id: string
          message_id: string
          metadata: Json | null
          openai_file_id: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          file_type?: string | null
          id?: string
          message_id: string
          metadata?: Json | null
          openai_file_id: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          file_type?: string | null
          id?: string
          message_id?: string
          metadata?: Json | null
          openai_file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_generated_images_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_pins: {
        Row: {
          created_at: string
          id: string
          message_id: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_pins_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string | null
          id: string
          is_positive: boolean
          message_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_positive: boolean
          message_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_positive?: boolean
          message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
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
      service_connections: {
        Row: {
          connection_name: string
          created_at: string
          credential_id: string | null
          id: string
          is_active: boolean
          last_sync_at: string | null
          service: string
          service_metadata: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_name: string
          created_at?: string
          credential_id?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          service: string
          service_metadata?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_name?: string
          created_at?: string
          credential_id?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          service?: string
          service_metadata?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_connections_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "api_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      session_files: {
        Row: {
          added_at: string | null
          file_id: string
          is_active: boolean | null
          session_id: string
        }
        Insert: {
          added_at?: string | null
          file_id: string
          is_active?: boolean | null
          session_id: string
        }
        Update: {
          added_at?: string | null
          file_id?: string
          is_active?: boolean | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "excel_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_files_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      waitlist_users: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      workflow_edges: {
        Row: {
          created_at: string | null
          edge_id: string | null
          edge_type: string
          id: string
          metadata: Json | null
          source_node_id: string
          target_node_id: string
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          edge_id?: string | null
          edge_type?: string
          id?: string
          metadata?: Json | null
          source_node_id: string
          target_node_id: string
          updated_at?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          edge_id?: string | null
          edge_type?: string
          id?: string
          metadata?: Json | null
          source_node_id?: string
          target_node_id?: string
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_edges_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_executions: {
        Row: {
          completed_at: string | null
          error: string | null
          id: string
          initiated_by: string | null
          inputs: Json | null
          logs: Json[] | null
          node_states: Json
          outputs: Json | null
          started_at: string
          status: string
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          id?: string
          initiated_by?: string | null
          inputs?: Json | null
          logs?: Json[] | null
          node_states?: Json
          outputs?: Json | null
          started_at?: string
          status?: string
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          id?: string
          initiated_by?: string | null
          inputs?: Json | null
          logs?: Json[] | null
          node_states?: Json
          outputs?: Json | null
          started_at?: string
          status?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_file_schemas: {
        Row: {
          columns: string[]
          created_at: string
          data_types: Json
          file_id: string
          has_headers: boolean
          id: string
          is_temporary: boolean
          node_id: string
          sample_data: Json[] | null
          sheet_index: number | null
          sheet_name: string | null
          total_rows: number | null
          updated_at: string
          workflow_id: string
        }
        Insert: {
          columns?: string[]
          created_at?: string
          data_types?: Json
          file_id: string
          has_headers?: boolean
          id?: string
          is_temporary?: boolean
          node_id: string
          sample_data?: Json[] | null
          sheet_index?: number | null
          sheet_name?: string | null
          total_rows?: number | null
          updated_at?: string
          workflow_id: string
        }
        Update: {
          columns?: string[]
          created_at?: string
          data_types?: Json
          file_id?: string
          has_headers?: boolean
          id?: string
          is_temporary?: boolean
          node_id?: string
          sample_data?: Json[] | null
          sheet_index?: number | null
          sheet_name?: string | null
          total_rows?: number | null
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_file_schemas_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "excel_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_file_schemas_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_files: {
        Row: {
          completed_at: string | null
          created_at: string | null
          file_id: string
          id: string
          is_active: boolean | null
          is_temporary: boolean
          metadata: Json | null
          node_id: string | null
          processing_result: Json | null
          processing_status: string | null
          status: string | null
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          file_id: string
          id?: string
          is_active?: boolean | null
          is_temporary?: boolean
          metadata?: Json | null
          node_id?: string | null
          processing_result?: Json | null
          processing_status?: string | null
          status?: string | null
          updated_at?: string | null
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          file_id?: string
          id?: string
          is_active?: boolean | null
          is_temporary?: boolean
          metadata?: Json | null
          node_id?: string | null
          processing_result?: Json | null
          processing_status?: string | null
          status?: string | null
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "excel_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_files_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_folders: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "workflow_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_node_usage_stats: {
        Row: {
          average_duration_ms: number | null
          execution_count: number
          failed_executions: number
          id: string
          last_updated_at: string
          node_type: string
          successful_executions: number
        }
        Insert: {
          average_duration_ms?: number | null
          execution_count?: number
          failed_executions?: number
          id?: string
          last_updated_at?: string
          node_type: string
          successful_executions?: number
        }
        Update: {
          average_duration_ms?: number | null
          execution_count?: number
          failed_executions?: number
          id?: string
          last_updated_at?: string
          node_type?: string
          successful_executions?: number
        }
        Relationships: []
      }
      workflow_schedules: {
        Row: {
          created_at: string
          created_by: string
          cron_expression: string
          id: string
          is_active: boolean
          last_run_at: string | null
          next_run_at: string | null
          timezone: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          cron_expression: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string | null
          timezone?: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          cron_expression?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string | null
          timezone?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_schedules_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_step_logs: {
        Row: {
          cell_changes: Json | null
          created_at: string
          execution_id: string
          execution_time_ms: number
          id: string
          input_data: Json | null
          node_id: string
          node_type: string
          output_data: Json | null
          processing_metadata: Json | null
          status: Database["public"]["Enums"]["log_status"]
          workflow_id: string | null
        }
        Insert: {
          cell_changes?: Json | null
          created_at?: string
          execution_id: string
          execution_time_ms?: number
          id?: string
          input_data?: Json | null
          node_id: string
          node_type: string
          output_data?: Json | null
          processing_metadata?: Json | null
          status?: Database["public"]["Enums"]["log_status"]
          workflow_id?: string | null
        }
        Update: {
          cell_changes?: Json | null
          created_at?: string
          execution_id?: string
          execution_time_ms?: number
          id?: string
          input_data?: Json | null
          node_id?: string
          node_type?: string
          output_data?: Json | null
          processing_metadata?: Json | null
          status?: Database["public"]["Enums"]["log_status"]
          workflow_id?: string | null
        }
        Relationships: []
      }
      workflow_steps: {
        Row: {
          completed_at: string | null
          configuration: Json | null
          created_at: string | null
          created_by: string | null
          dependencies: Json | null
          error_message: string | null
          execution_data: Json | null
          id: string
          node_category: Database["public"]["Enums"]["node_category"]
          node_id: string
          node_type: string
          started_at: string | null
          status: string | null
          step_order: number
          updated_at: string | null
          workflow_id: string | null
        }
        Insert: {
          completed_at?: string | null
          configuration?: Json | null
          created_at?: string | null
          created_by?: string | null
          dependencies?: Json | null
          error_message?: string | null
          execution_data?: Json | null
          id?: string
          node_category: Database["public"]["Enums"]["node_category"]
          node_id: string
          node_type: string
          started_at?: string | null
          status?: string | null
          step_order: number
          updated_at?: string | null
          workflow_id?: string | null
        }
        Update: {
          completed_at?: string | null
          configuration?: Json | null
          created_at?: string | null
          created_by?: string | null
          dependencies?: Json | null
          error_message?: string | null
          execution_data?: Json | null
          id?: string
          node_category?: Database["public"]["Enums"]["node_category"]
          node_id?: string
          node_type?: string
          started_at?: string | null
          status?: string | null
          step_order?: number
          updated_at?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          category: string
          created_at: string
          definition: Json
          description: string | null
          difficulty: string
          estimated_time_saved: string | null
          id: string
          is_official: boolean
          name: string
          preview_image_url: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          definition: Json
          description?: string | null
          difficulty: string
          estimated_time_saved?: string | null
          id?: string
          is_official?: boolean
          name: string
          preview_image_url?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          definition?: Json
          description?: string | null
          difficulty?: string
          estimated_time_saved?: string | null
          id?: string
          is_official?: boolean
          name?: string
          preview_image_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      workflow_usage_stats: {
        Row: {
          average_duration_ms: number | null
          execution_count: number
          failed_executions: number
          id: string
          last_30_days_executions: number
          last_updated_at: string
          successful_executions: number
          time_saved_estimate_seconds: number
          workflow_id: string
        }
        Insert: {
          average_duration_ms?: number | null
          execution_count?: number
          failed_executions?: number
          id?: string
          last_30_days_executions?: number
          last_updated_at?: string
          successful_executions?: number
          time_saved_estimate_seconds?: number
          workflow_id: string
        }
        Update: {
          average_duration_ms?: number | null
          execution_count?: number
          failed_executions?: number
          id?: string
          last_30_days_executions?: number
          last_updated_at?: string
          successful_executions?: number
          time_saved_estimate_seconds?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_usage_stats_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          created_by: string
          definition: Json
          description: string | null
          folder_id: string | null
          id: string
          is_template: boolean
          is_temporary: boolean
          last_run_at: string | null
          last_run_status: string | null
          name: string
          status: string
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          definition: Json
          description?: string | null
          folder_id?: string | null
          id?: string
          is_template?: boolean
          is_temporary?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          name: string
          status?: string
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: Json
          description?: string | null
          folder_id?: string | null
          id?: string
          is_template?: boolean
          is_temporary?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          name?: string
          status?: string
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflows_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "workflow_folders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      associate_file_with_workflow_node: {
        Args: { p_file_id: string; p_workflow_id: string; p_node_id: string }
        Returns: boolean
      }
      check_node_logs: {
        Args: { node_id_param: string }
        Returns: {
          has_logs: boolean
        }[]
      }
      cleanup_orphaned_files: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_orphaned_messages: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      compute_excel_diff: {
        Args: { input_data: Json; output_data: Json }
        Returns: Json
      }
      extract_excel_sheet_data: {
        Args: { log_data: Json }
        Returns: Json
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      has_excel_data: {
        Args: { node_id_param: string }
        Returns: {
          has_excel_data: boolean
        }[]
      }
      migrate_workflow_schemas: {
        Args: { source_workflow_id: string; target_workflow_id: string }
        Returns: boolean
      }
      normalize_workflow_id: {
        Args: { workflow_id: string }
        Returns: string
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      start_workflow_execution: {
        Args: { workflow_id: string; inputs?: Json }
        Returns: Json
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
      log_status: "success" | "error" | "warning" | "info"
      message_status:
        | "in_progress"
        | "completed"
        | "failed"
        | "cancelled"
        | "expired"
        | "processing"
        | "queued"
      node_category:
        | "input"
        | "processing"
        | "ai"
        | "output"
        | "integration"
        | "control"
        | "utility"
      tag_type: "system" | "custom"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      file_processing_status: [
        "pending",
        "uploading",
        "processing",
        "analyzing",
        "completed",
        "error",
      ],
      log_status: ["success", "error", "warning", "info"],
      message_status: [
        "in_progress",
        "completed",
        "failed",
        "cancelled",
        "expired",
        "processing",
        "queued",
      ],
      node_category: [
        "input",
        "processing",
        "ai",
        "output",
        "integration",
        "control",
        "utility",
      ],
      tag_type: ["system", "custom"],
    },
  },
} as const
